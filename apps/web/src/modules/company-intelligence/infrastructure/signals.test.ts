import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { env } from "@repo/env/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompanyService } from "../application/service";
import { createManualSignalsService } from "../application/signals";
import type { SignalPayload, SignalWorkspace } from "../domain/signal-types";
import type { Actor } from "../domain/types";
import { createCompanyRepository } from "./repository";

const databaseUrl = env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL manual signals", () => {
  const schema = `signals_test_${randomUUID().replaceAll("-", "")}`;
  const firmId = randomUUID();
  const otherFirmId = randomUUID();
  const actor: Actor = { userId: randomUUID(), firmId, role: "contributor" };
  const viewer: Actor = { userId: randomUUID(), firmId, role: "viewer" };
  const outsider: Actor = {
    userId: randomUUID(),
    firmId: otherFirmId,
    role: "contributor",
  };
  const now = "2026-10-24T00:00:00.000Z";
  let admin: ReturnType<typeof postgres> | undefined;
  let sql: ReturnType<typeof postgres>;
  let repository: ReturnType<typeof createCompanyRepository>;
  let companies: ReturnType<typeof createCompanyService>;
  let service: ReturnType<typeof createManualSignalsService>;
  const financing = (): NonNullable<SignalPayload["financing"]> => ({
    roundType: "seed",
    amount: "12345678901234567890.1234",
    currency: "USD",
    investors: ["TEST Capital"],
    valuation: "99999999999999999999.9999",
    valuationKind: "post_money",
  });
  const payload = (changes: Partial<SignalPayload> = {}): SignalPayload => ({
    title: "TEST Seed financing",
    category: "financing",
    summary: "Company announced a financing round.",
    eventDate: { precision: "day", value: "2026-01-15" },
    status: "unreviewed",
    sources: [
      {
        title: "Original announcement",
        url: "https://example.com/round",
        publishedOn: "2026-01-15",
        observedAt: now,
      },
    ],
    financing: {
      roundType: "seed",
      amount: "12345678901234567890.1234",
      currency: "USD",
      investors: ["TEST Capital"],
      valuation: "99999999999999999999.9999",
      valuationKind: "post_money",
    },
    ...changes,
  });
  const createCompany = (owner = actor) =>
    companies.createCompany(owner, {
      requestId: randomUUID(),
      name: `TEST ${randomUUID()}`,
    });
  const record = (id: string, version = 1, body = payload()) =>
    service.createSignal(actor, id, {
      requestId: randomUUID(),
      expectedCompanyVersion: version,
      payload: body,
    });
  const correct = (
    companyId: string,
    workspace: SignalWorkspace,
    body: SignalPayload,
    index = 0,
  ) => {
    const detail = workspace.signals[index];
    return service.correctSignal(actor, companyId, detail.signal.id, {
      requestId: randomUUID(),
      expectedCompanyVersion: workspace.companyVersion,
      expectedSignalVersion: detail.signal.version,
      payload: body,
      reason: "TEST Source correction",
    });
  };
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("Local test database required");
    admin = postgres(databaseUrl, { onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(schema)}`;
    url.searchParams.set("options", `-c search_path=${schema}`);
    sql = postgres(url.toString(), { onnotice: () => {} });
    repository = createCompanyRepository(url.toString());
    const migrationRoot = new URL("../../../../drizzle/", import.meta.url);
    const journal = JSON.parse(
      await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      const source = await readFile(
        new URL(`${tag}.sql`, migrationRoot),
        "utf8",
      );
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim())
          await sql.unsafe(statement.replaceAll('"public".', `"${schema}".`));
    }
    await sql`INSERT INTO research_firms (id,name,state) VALUES (${firmId},'Signal test firm','{}'::jsonb), (${otherFirmId},'Other firm','{}'::jsonb)`;
    for (const member of [actor, viewer, outsider])
      await sql`INSERT INTO research_memberships (user_id,firm_id,role) VALUES (${member.userId},${member.firmId},${member.role})`;
    companies = createCompanyService({
      repository,
      clock: { id: randomUUID, now: () => now },
    });
    service = createManualSignalsService({
      repository: repository.signals,
      clock: { id: randomUUID, now: () => now },
    });
  });
  afterAll(async () => {
    await repository?.close();
    await sql?.end();
    if (admin)
      try {
        await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      } finally {
        await admin.end();
      }
  });
  it("enforces membership and company ownership for reads, writes, and corrections", async () => {
    const company = await createCompany();
    const second = await createCompany();
    const workspace = await record(company.id);
    expect((await service.workspace(viewer, company.id)).signals).toHaveLength(
      1,
    );
    await expect(service.workspace(outsider, company.id)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      service.financingHistory(outsider, company.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.createSignal(viewer, company.id, {
        requestId: randomUUID(),
        expectedCompanyVersion: 2,
        payload: payload(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.workspace({ ...actor, role: "admin" }, company.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.correctSignal(actor, second.id, workspace.signals[0].signal.id, {
        requestId: randomUUID(),
        expectedCompanyVersion: 1,
        expectedSignalVersion: 1,
        payload: payload(),
        reason: "TEST Wrong company",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("rejects revision and projection references across firms and companies at the database boundary", async () => {
    const company = await createCompany();
    const second = await createCompany();
    const workspace = await record(company.id);
    const signal = workspace.signals[0].signal;
    const revision = workspace.signals[0].revisions[0];
    for (const context of [
      { firm: otherFirmId, company: company.id },
      { firm: firmId, company: second.id },
    ]) {
      await expect(
        sql`INSERT INTO intelligence_signal_revisions (id,firm_id,company_id,signal_id,revision,payload,material,reason,created_by,created_at) VALUES (${randomUUID()},${context.firm},${context.company},${signal.id},2,${sql.json(payload())},true,'TEST Invalid context',${actor.userId},${now})`,
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        sql`UPDATE intelligence_financing SET company_id=${context.company}, firm_id=${context.firm} WHERE signal_id=${signal.id}`,
      ).rejects.toMatchObject({ code: "23503" });
    }
    await expect(
      sql`INSERT INTO intelligence_signal_revisions (id,firm_id,company_id,signal_id,revision,payload,material,reason,created_by,created_at) VALUES (${randomUUID()},${firmId},${company.id},${signal.id},1,${sql.json(payload())},true,'TEST Duplicate revision',${actor.userId},${now})`,
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (await service.workspace(actor, company.id)).signals[0].revisions[0].id,
    ).toBe(revision.id);
  });
  it("replays a concurrent committed request once and rejects stale company and signal versions", async () => {
    const company = await createCompany();
    const input = {
      requestId: randomUUID(),
      expectedCompanyVersion: 1,
      payload: payload(),
    };
    const [first, replay] = await Promise.all([
      service.createSignal(actor, company.id, input),
      service.createSignal(actor, company.id, input),
    ]);
    expect(replay).toEqual(first);
    expect(first.signals).toHaveLength(1);
    expect(first.signals[0].revisions).toHaveLength(1);
    await expect(record(company.id, 1)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      service.createSignal(actor, company.id, {
        ...input,
        payload: payload({ title: "Different" }),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      service.correctSignal(actor, company.id, first.signals[0].signal.id, {
        requestId: randomUUID(),
        expectedCompanyVersion: 2,
        expectedSignalVersion: 2,
        payload: payload(),
        reason: "TEST Stale",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await service.workspace(actor, company.id)).companyVersion).toBe(2);
  });
  it("serializes signal and existing company fact mutations against the same company version", async () => {
    const company = await createCompany();
    const results = await Promise.allSettled([
      record(company.id),
      companies.addAssertion(actor, company.id, {
        requestId: randomUUID(),
        expectedVersion: 1,
        field: "description",
        value: "TEST Concurrent fact",
        sourceUrl: "https://example.com/company",
        sourceTitle: "Company",
        observedAt: now,
        claimKind: "reported",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: "conflict",
    });
    const profile = await companies.profile(actor, company.id);
    const workspace = await service.workspace(actor, company.id);
    expect(profile.company.version).toBe(2);
    expect(profile.assertions.length + workspace.signals.length).toBe(1);
  });
  it("requires review for exact duplicate events but permits distinct same-day rounds", async () => {
    const company = await createCompany();
    let workspace = await record(company.id);
    await expect(record(company.id, 2)).rejects.toMatchObject({
      code: "conflict",
    });
    workspace = await record(
      company.id,
      2,
      payload({
        title: "TEST Debt financing",
        financing: { ...financing(), roundType: "debt" },
      }),
    );
    expect(workspace.signals).toHaveLength(2);
    workspace = await service.createSignal(actor, company.id, {
      requestId: randomUUID(),
      expectedCompanyVersion: 3,
      payload: payload(),
      duplicateReason: "TEST Distinct closing",
    });
    expect(workspace.signals).toHaveLength(3);
  });
  it("preserves previous revisions and removes disputed, retracted, or recategorized financing", async () => {
    const company = await createCompany();
    let workspace = await record(company.id);
    const original = workspace.signals[0].revisions[0];
    workspace = await correct(
      company.id,
      workspace,
      payload({
        sources: [{ ...payload().sources[0], title: "Updated source title" }],
      }),
    );
    expect(workspace.signals[0].revisions[0]).toEqual(original);
    expect(workspace.signals[0].revisions[1].material).toBe(false);
    for (const status of ["disputed", "retracted", "verified"] as const) {
      workspace = await correct(company.id, workspace, payload({ status }));
      expect(
        (await service.financingHistory(actor, company.id)).rounds,
      ).toHaveLength(status === "verified" ? 1 : 0);
    }
    workspace = await correct(
      company.id,
      workspace,
      payload({ category: "product", financing: null }),
    );
    expect(
      (await service.financingHistory(actor, company.id)).rounds,
    ).toHaveLength(0);
    expect(workspace.signals[0].revisions).toHaveLength(6);
  });
  it("keeps exact original-currency decimals and applies filters to the same financing row", async () => {
    const company = await createCompany();
    await record(company.id);
    await record(
      company.id,
      2,
      payload({
        title: "TEST EUR debt",
        financing: {
          ...financing(),
          roundType: "debt",
          amount: "5.0001",
          currency: "EUR",
        },
      }),
    );
    const { rounds } = await service.financingHistory(viewer, company.id, {
      currency: "USD",
      roundType: "seed",
      minAmount: "12345678901234567890.1234",
      maxAmount: "12345678901234567890.1234",
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0].amount).toBe("12345678901234567890.1234");
    expect(rounds[0].valuation).toBe("99999999999999999999.9999");
    expect(
      (
        await service.financingHistory(actor, company.id, {
          currency: "USD",
          roundType: "debt",
        })
      ).rounds,
    ).toHaveLength(0);
    expect(
      (
        await service.financingHistory(actor, company.id, {
          currency: "USD",
          minAmount: "12345678901234567890.1235",
        })
      ).rounds,
    ).toHaveLength(0);
  });
  it("persists financing titles longer than 200 characters and rejects null valuation kinds in SQL", async () => {
    const company = await createCompany();
    const title = `TEST ${"Long financing announcement ".repeat(10)}`;
    expect(title.length).toBeGreaterThan(200);
    expect(title.length).toBeLessThanOrEqual(300);
    const workspace = await record(company.id, 1, payload({ title }));
    const signalId = workspace.signals[0].signal.id;
    expect(
      (await service.financingHistory(actor, company.id)).rounds[0].title,
    ).toBe(title.trim());
    await expect(
      sql`UPDATE intelligence_financing SET valuation_kind=NULL WHERE signal_id=${signalId}`,
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("intersects month and year date intervals and excludes unknown dates from bounded queries", async () => {
    const company = await createCompany();
    await record(
      company.id,
      1,
      payload({
        title: "TEST Month",
        eventDate: { precision: "month", value: "2026-02" },
      }),
    );
    await record(
      company.id,
      2,
      payload({
        title: "TEST Year",
        eventDate: { precision: "year", value: "2025" },
      }),
    );
    await record(
      company.id,
      3,
      payload({
        title: "TEST Unknown",
        eventDate: { precision: "unknown", value: null },
      }),
    );
    expect(
      (await service.financingHistory(actor, company.id)).rounds,
    ).toHaveLength(3);
    expect(
      (
        await service.financingHistory(actor, company.id, {
          from: "2026-02-28",
          to: "2026-02-28",
        })
      ).rounds.map((row) => row.title),
    ).toEqual(["TEST Month"]);
    expect(
      (
        await service.financingHistory(actor, company.id, {
          from: "2025-06-01",
          to: "2025-06-02",
        })
      ).rounds.map((row) => row.title),
    ).toEqual(["TEST Year"]);
    expect(
      (
        await service.financingHistory(actor, company.id, {
          from: "2026-03-01",
        })
      ).rounds,
    ).toHaveLength(0);
  });
  it("rolls signal, revision, projection, audit, and ledger back atomically", async () => {
    const company = await createCompany();
    const requestId = randomUUID();
    const signalId = randomUUID();
    const revisionId = randomUUID();
    await expect(
      repository.signals.write(
        actor,
        requestId,
        "TEST rollback",
        async (tx) => {
          await tx.insertSignal({
            id: signalId,
            firmId,
            companyId: company.id,
            version: 1,
            duplicateKey: "TEST",
            createdBy: actor.userId,
            createdAt: now,
            updatedAt: now,
          });
          await tx.appendRevision({
            id: revisionId,
            firmId,
            companyId: company.id,
            signalId,
            revision: 1,
            payload: payload(),
            material: true,
            reason: "Initial",
            createdBy: actor.userId,
            createdAt: now,
          });
          await tx.replaceFinancing(company.id, signalId, {
            firmId,
            companyId: company.id,
            signalId,
            revisionId,
            title: "TEST rollback",
            ...financing(),
            dateStart: "2026-01-15",
            dateEnd: "2026-01-15",
            eventDate: { precision: "day", value: "2026-01-15" },
            status: "unreviewed",
            createdAt: now,
          });
          await tx.appendAudit({
            id: randomUUID(),
            firmId,
            companyId: company.id,
            actorId: actor.userId,
            action: "signal.created",
            detail: { signalId },
            createdAt: now,
          });
          await tx.bumpVersion(company.id, 1, now);
          throw new Error("TEST rollback");
        },
      ),
    ).rejects.toThrow("TEST rollback");
    expect((await service.workspace(actor, company.id)).signals).toHaveLength(
      0,
    );
    expect((await service.workspace(actor, company.id)).companyVersion).toBe(1);
    expect(
      (await service.financingHistory(actor, company.id)).rounds,
    ).toHaveLength(0);
    expect(
      await sql`SELECT id FROM intelligence_signal_revisions WHERE signal_id=${signalId}`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT id FROM intelligence_audit WHERE company_id=${company.id} AND action='signal.created'`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT request_id FROM intelligence_requests WHERE request_id=${requestId}`,
    ).toHaveLength(0);
  });
});
