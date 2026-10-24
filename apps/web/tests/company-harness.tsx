/** Standalone loopback-only browser harness. Fixture authentication is injected
 * into the production HTTP handler; this file is never imported by the app. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { env } from "@repo/env/server";
import { build } from "esbuild";
import postgres from "postgres";
import { createCompanyService } from "../src/modules/company-intelligence/application/service";
import { createManualSignalsService } from "../src/modules/company-intelligence/application/signals";
import type { Actor } from "../src/modules/company-intelligence/domain/types";
import { createCompanyRepository } from "../src/modules/company-intelligence/infrastructure/repository";
import { createCompanyHttpHandler } from "../src/modules/company-intelligence/presentation/http";

if (!env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required for company browser tests");
const databaseUrl = new URL(env.TEST_DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname))
  throw new Error("Company browser tests require a local TEST_DATABASE_URL");
const schema = `company_browser_${randomUUID().replaceAll("-", "")}`;
const admin = postgres(databaseUrl.toString(), { onnotice: () => {} });
await admin`CREATE SCHEMA ${admin(schema)}`;
databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
const sql = postgres(databaseUrl.toString(), { onnotice: () => {} });
const repository = createCompanyRepository(databaseUrl.toString());
const firmId = randomUUID();
const contributor: Actor = {
  userId: "TEST_contributor",
  firmId,
  role: "contributor",
};
const viewer: Actor = { userId: "TEST_viewer", firmId, role: "viewer" };
const service = createCompanyService({
  repository,
  clock: { id: randomUUID, now: () => new Date().toISOString() },
});
const signalsService = createManualSignalsService({
  repository: repository.signals,
  clock: { id: randomUUID, now: () => new Date().toISOString() },
});
const migrationRoot = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
) as { entries: { tag: string }[] };
for (const { tag } of journal.entries) {
  const source = await readFile(new URL(`${tag}.sql`, migrationRoot), "utf8");
  for (const statement of source.split("--> statement-breakpoint"))
    if (statement.trim())
      await sql.unsafe(statement.replaceAll('"public".', `"${schema}".`));
}
await sql`INSERT INTO research_firms (id, name, state) VALUES (${firmId}, 'TEST Investment team', '{}'::jsonb)`;
for (const actor of [contributor, viewer])
  await sql`INSERT INTO research_memberships (user_id, firm_id, role) VALUES (${actor.userId}, ${firmId}, ${actor.role})`;
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CompanyDirectory} from './src/modules/company-intelligence/presentation/company-directory'; import {CompanyProfile} from './src/modules/company-intelligence/presentation/company-profile'; import {CompanyShell} from './src/modules/company-intelligence/presentation/company-shell'; fetch('/test/initial?'+new URLSearchParams(location.search).toString()+'&path='+encodeURIComponent(location.pathname)).then(r=>r.json()).then(data=>createRoot(document.getElementById('root')).render(<CompanyShell>{data.profile?<CompanyProfile initial={data.profile} initialSignals={data.signals} canEdit={data.canEdit}/>:<CompanyDirectory initial={data.directory} canEdit={data.canEdit} query={data.query}/>}</CompanyShell>));`,
    loader: "tsx",
    resolveDir: resolve("."),
  },
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4327");
  const currentActor = req.headers.cookie?.includes("TEST_viewer=1")
    ? viewer
    : contributor;
  const send = (value: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  try {
    if (url.pathname === "/test/reset") {
      await sql`TRUNCATE intelligence_financing, intelligence_signal_revisions, intelligence_signals, intelligence_requests, intelligence_audit, intelligence_overrides, intelligence_assertions, intelligence_companies CASCADE`;
      res.setHeader("Set-Cookie", "TEST_viewer=; Path=/; Max-Age=0");
      send({ ok: true });
      return;
    }
    if (
      url.pathname === "/test/viewer" ||
      url.pathname === "/test/contributor"
    ) {
      res.setHeader(
        "Set-Cookie",
        url.pathname.endsWith("viewer")
          ? "TEST_viewer=1; Path=/"
          : "TEST_viewer=; Path=/; Max-Age=0",
      );
      send({ ok: true });
      return;
    }
    if (url.pathname === "/test/initial") {
      const companyId = url.searchParams
        .get("path")
        ?.match(/^\/companies\/([^/]+)\/?$/)?.[1];
      const query = url.searchParams.get("q") ?? "";
      send({
        profile: companyId
          ? await service.profile(currentActor, companyId)
          : null,
        signals: companyId
          ? await signalsService.workspace(currentActor, companyId)
          : null,
        directory: companyId
          ? null
          : await service.listCompanies(currentActor, { q: query }),
        canEdit: currentActor.role !== "viewer",
        query,
      });
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    if (url.pathname === "/test/concurrent-save") {
      const { companyId } = JSON.parse(bytes.toString());
      const profile = await service.profile(contributor, companyId);
      send(
        await service.addAssertion(contributor, companyId, {
          requestId: randomUUID(),
          expectedVersion: profile.company.version,
          field: "description",
          value: "TEST concurrent description",
          sourceTitle: "TEST concurrent source",
          sourceUrl: "https://source.example.com/concurrent",
          observedAt: "2026-01-01T00:00:00.000Z",
          claimKind: "reported",
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/api/company-intelligence/")) {
      const handler = createCompanyHttpHandler({
        session: async () => {
          const actor = await repository.actorFor(currentActor.userId);
          if (!actor) throw new Error("TEST fixture membership missing");
          return { actor, service, signalsService };
        },
        logError: (name, id) => console.error(name, id),
      });
      const request = new Request(url, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        ...(bytes.length ? { body: bytes } : {}),
      });
      const response = await handler(
        request,
        url.pathname
          .slice("/api/company-intelligence/".length)
          .split("/")
          .filter(Boolean),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (url.pathname === "/client.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
      return;
    }
    if (url.pathname === "/companies.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(await readFile(resolve("src/app/companies/companies.css")));
      return;
    }
    if (
      !/^\/companies(?:\/[^/]+)?\/?$/.test(url.pathname) &&
      url.pathname !== "/"
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEST Company intelligence</title><link rel="stylesheet" href="/companies.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/client.js"></script></body></html>',
    );
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "TEST harness failure" }));
  }
});
server.listen(4327, "127.0.0.1");
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close();
    void (async () => {
      await repository.close();
      await sql.end();
      await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      await admin.end();
      process.exit();
    })();
  });
