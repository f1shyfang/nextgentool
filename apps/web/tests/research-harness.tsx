/** Standalone browser integration harness, never imported by the shipped app.
 * Fixed TEST actors and an injected scanner fake exercise UI/service behavior.
 * Authentication, HTTP validation, Postgres and real scanning have separate tests.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { createResearchService } from "../src/modules/research-and-diligence/application/service";
import {
  type Actor,
  emptyState,
  ResearchError,
  type ResearchRepository,
  type SaveInput,
  type UploadInput,
} from "../src/modules/research-and-diligence/domain/types";
import { createPrivateStorage } from "../src/modules/research-and-diligence/infrastructure/files";
import { errorResponse } from "../src/modules/research-and-diligence/presentation/http";

const root = await mkdtemp(join(tmpdir(), "research-browser-test-"));
const actor: Actor = {
  userId: "TEST_analyst",
  firmId: "00000000-0000-4000-8000-000000000001",
  role: "admin",
};
const companyId = "00000000-0000-4000-8000-000000000002";
let state = emptyState();
let scannerFails = false;
let sequence = 0;
let serial = Promise.resolve();
function reset() {
  state = emptyState();
  state.companies.push({ id: companyId, name: "TEST Acme Research" });
  state.companies.push({
    id: "00000000-0000-4000-8000-000000000004",
    name: "TEST Second Company",
  });
  state.deals.push({
    id: "00000000-0000-4000-8000-000000000003",
    companyId,
    name: "TEST Series A",
  });
  scannerFails = false;
  sequence = 0;
}
reset();
const repository: ResearchRepository = {
  actorFor: async () => actor,
  read: async () => {
    await serial;
    return structuredClone(state);
  },
  transact: async (_actor, fn) => {
    const transaction = serial.then(async () => {
      const copy = structuredClone(state);
      const result = await fn(copy);
      state = copy;
      return structuredClone(result);
    });
    serial = transaction.then(
      () => {},
      () => {},
    );
    return transaction;
  },
};
const service = createResearchService({
  repository,
  storage: createPrivateStorage(root),
  inspector: {
    inspect: async (_filename, bytes) => {
      if (scannerFails)
        throw new ResearchError(
          "unavailable",
          "TEST scanner temporarily offline",
        );
      return {
        mediaType: "application/pdf",
        checksum: createHash("sha256").update(bytes).digest("hex"),
      };
    },
  },
  clock: {
    id: randomUUID,
    now: () => new Date(Date.UTC(2026, 9, 24, 0, 0, sequence++)).toISOString(),
  },
});
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ResearchWorkspace} from './src/modules/research-and-diligence/presentation/workspace'; fetch('/api/research').then(r=>r.json()).then(initial=>createRoot(document.getElementById('root')).render(<ResearchWorkspace initial={initial}/>));`,
    loader: "tsx",
    resolveDir: resolve("."),
  },
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = await readFile(resolve("src/app/research/research.css"));
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const currentActor: Actor = req.headers.cookie?.includes("TEST_viewer=1")
    ? { ...actor, role: "viewer" }
    : actor;
  const send = (value: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  try {
    if (path === "/test/reset") {
      await serial;
      reset();
      res.setHeader("Set-Cookie", "TEST_viewer=; Path=/; Max-Age=0");
      send({ ok: true });
      return;
    }
    if (path === "/test/viewer") {
      res.setHeader("Set-Cookie", "TEST_viewer=1; Path=/");
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const body = () => JSON.parse(bytes.toString());
    if (path === "/test/scanner") {
      scannerFails = body().fails;
      send({ ok: true });
      return;
    }
    if (path === "/test/concurrent-save") {
      const record = state.records.find((item) => item.id === body().id);
      const revision = record?.revisions.at(-1);
      if (!record || !revision)
        throw new ResearchError("missing", "TEST record not found");
      send(
        await service.save(actor, {
          ...revision,
          ...record,
          expectedRevisionId: revision.id,
          body: "TEST concurrent analyst update",
        }),
      );
      return;
    }
    if (path === "/api/research") {
      send(await service.workspace(currentActor));
      return;
    }
    if (path === "/api/research/records") {
      send(await service.save(currentActor, body() as SaveInput));
      return;
    }
    if (path === "/api/research/uploads") {
      send(await service.reserve(currentActor, body() as UploadInput));
      return;
    }
    const upload = path.match(/^\/api\/research\/uploads\/([^/]+)(\/retry)?$/);
    if (upload) {
      send(
        await service.upload(
          currentActor,
          upload[1],
          upload[2] ? undefined : bytes,
        ),
      );
      return;
    }
    const item = path.match(/^\/api\/research\/items\/([^/]+)$/);
    if (item) {
      send(await service.update(currentActor, item[1], body()));
      return;
    }
    const file = path.match(/^\/api\/research\/files\/([^/]+)$/);
    if (file) {
      const result = await service.download(currentActor, file[1]);
      res.setHeader("Content-Type", result.mediaType);
      res.end(result.bytes);
      return;
    }
    if (path === "/client.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
      return;
    }
    if (path === "/research.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
      return;
    }
    if (path !== "/") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEST Research workspace</title><link rel="stylesheet" href="/research.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/client.js"></script></body></html>',
    );
  } catch (error) {
    const response = errorResponse(error);
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(await response.text());
  }
});
server.listen(4319, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close();
    void rm(root, { recursive: true, force: true }).then(() => process.exit());
  });
