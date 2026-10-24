import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { env } from "@repo/env/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompanyService } from "../application/service";
import type { Actor, Assertion, Company } from "../domain/types";
import { createCompanyRepository } from "./repository";

const databaseUrl = env.TEST_DATABASE_URL;
// Opt-in locally; CI's dedicated PostgreSQL job supplies TEST_DATABASE_URL.
describe.skipIf(!databaseUrl)("PostgreSQL company intelligence", () => {
  const schema = `intelligence_test_${randomUUID().replaceAll("-", "")}`;
  const firmId = randomUUID();
  const otherFirmId = randomUUID();
  const contributor: Actor = {
    userId: `contributor_${randomUUID()}`,
    firmId,
    role: "contributor",
  };
  const viewer: Actor = {
    userId: `viewer_${randomUUID()}`,
    firmId,
    role: "viewer",
  };
  const administrator: Actor = {
    userId: `admin_${randomUUID()}`,
    firmId,
    role: "admin",
  };
  const outsider: Actor = {
    userId: `other_${randomUUID()}`,
    firmId: otherFirmId,
    role: "contributor",
  };
  const now = "2026-10-24T00:00:00.000Z";
  let admin: ReturnType<typeof postgres> | undefined;
  let schemaCreated = false;
  let sql: ReturnType<typeof postgres>;
  let repository: ReturnType<typeof createCompanyRepository>;
  let service: ReturnType<typeof createCompanyService>;
  const create = (name: string, actor = contributor) =>
    service.createCompany(actor, {
      requestId: randomUUID(),
      name,
      domain: `${randomUUID()}.example.com`,
    });
  const assertionInput = (
    expectedVersion: number,
    value = "First description",
  ) => ({
    requestId: randomUUID(),
    expectedVersion,
    field: "description",
    value,
    sourceUrl: "https://source.example.com/article",
    sourceTitle: "Original report",
    observedAt: now,
    claimKind: "reported",
  });

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error(
        "Company integration tests require a local TEST_DATABASE_URL",
      );
    admin = postgres(databaseUrl, { onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(schema)}`;
    schemaCreated = true;
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
      for (const statement of source.split("--> statement-breakpoint")) {
        if (statement.trim())
          await sql.unsafe(statement.replaceAll('"public".', `"${schema}".`));
      }
    }
    await sql`INSERT INTO research_firms (id, name, state) VALUES (${firmId}, 'Company test firm', '{}'::jsonb), (${otherFirmId}, 'Other test firm', '{}'::jsonb)`;
    for (const actor of [contributor, viewer, administrator, outsider])
      await sql`INSERT INTO research_memberships (user_id, firm_id, role) VALUES (${actor.userId}, ${actor.firmId}, ${actor.role})`;
    service = createCompanyService({
      repository,
      clock: { id: randomUUID, now: () => now },
    });
  });

  afterAll(async () => {
    await repository?.close();
    await sql?.end();
    if (admin) {
      try {
        if (schemaCreated)
          await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      } finally {
        await admin.end();
      }
    }
  });

  it("checks current membership and tenant on reads and writes for every role", async () => {
    const company = await create("Visible to firm");
    expect(await repository.actorFor(contributor.userId)).toEqual(contributor);
    expect(await repository.actorFor("missing-user")).toBeNull();
    expect((await service.profile(viewer, company.id)).company.id).toBe(
      company.id,
    );
    await create("Admin company", administrator);
    await expect(create("Viewer forbidden", viewer)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.profile(outsider, company.id)).rejects.toMatchObject({
      code: "not_found",
    });
    for (const forged of [
      { ...contributor, firmId: otherFirmId },
      { ...contributor, role: "admin" as const },
    ]) {
      await expect(service.listCompanies(forged)).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(create("Forged write", forged)).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    const revoked: Actor = {
      ...contributor,
      userId: `revoked_${randomUUID()}`,
    };
    await sql`INSERT INTO research_memberships (user_id, firm_id, role) VALUES (${revoked.userId}, ${firmId}, 'contributor')`;
    expect(await repository.actorFor(revoked.userId)).toEqual(revoked);
    await sql`DELETE FROM research_memberships WHERE user_id = ${revoked.userId}`;
    await expect(service.listCompanies(revoked)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(create("Revoked write", revoked)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rechecks membership after a concurrent revocation releases the firm lock", async () => {
    const revoked: Actor = {
      ...contributor,
      userId: `waiting_${randomUUID()}`,
    };
    await sql`INSERT INTO research_memberships (user_id, firm_id, role) VALUES (${revoked.userId}, ${firmId}, 'contributor')`;
    let markLocked = () => {};
    let releaseLock = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const revocation = sql.begin(async (tx) => {
      await tx`SELECT id FROM research_firms WHERE id = ${firmId} FOR UPDATE`;
      markLocked();
      await release;
      await tx`DELETE FROM research_memberships WHERE user_id = ${revoked.userId}`;
    });
    await locked;
    let callbackRan = false;
    const mutation = repository.write(
      revoked,
      randomUUID(),
      "revoked while waiting",
      async () => {
        callbackRan = true;
        return { changed: true };
      },
    );
    const rejected = expect(mutation).rejects.toMatchObject({
      code: "forbidden",
    });
    releaseLock();
    await revocation;
    await rejected;
    expect(callbackRan).toBe(false);
  });

  it("serializes simultaneous duplicate creation and commits one company and audit", async () => {
    const name = `Concurrent ${randomUUID()}`;
    const results = await Promise.allSettled([create(name), create(name)]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toMatchObject({
      code: "conflict",
    });
    const rows =
      await sql`SELECT id FROM intelligence_companies WHERE firm_id = ${firmId} AND name = ${name}`;
    expect(rows).toHaveLength(1);
    expect(
      await sql`SELECT id FROM intelligence_audit WHERE company_id = ${rows[0].id}`,
    ).toHaveLength(1);
  });

  it("replays an identical concurrent request once and rejects reuse with different data", async () => {
    const input = { requestId: randomUUID(), name: `Replay ${randomUUID()}` };
    const [first, second] = await Promise.all([
      service.createCompany(contributor, input),
      service.createCompany(contributor, input),
    ]);
    expect(second).toEqual(first);
    expect(
      await sql`SELECT id FROM intelligence_audit WHERE company_id = ${first.id}`,
    ).toHaveLength(1);
    expect(
      await sql`SELECT request_id FROM intelligence_requests WHERE request_id = ${input.requestId}`,
    ).toHaveLength(1);
    await expect(
      service.createCompany(contributor, { ...input, name: "Different name" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rolls back company, audit, and request ledger together when a mutation fails", async () => {
    const company: Company = {
      id: randomUUID(),
      firmId,
      name: "Rolled back",
      domain: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const requestId = randomUUID();
    await expect(
      repository.write(contributor, requestId, "rollback", async (tx) => {
        await tx.insertCompany(company);
        await tx.appendAudit({
          id: randomUUID(),
          firmId,
          companyId: company.id,
          actorId: contributor.userId,
          action: "company.created",
          detail: {},
          createdAt: now,
        });
        throw new Error("Intentional rollback");
      }),
    ).rejects.toThrow("Intentional rollback");
    expect(
      await sql`SELECT id FROM intelligence_companies WHERE id = ${company.id}`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT id FROM intelligence_audit WHERE company_id = ${company.id}`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT request_id FROM intelligence_requests WHERE request_id = ${requestId}`,
    ).toHaveLength(0);
  });

  it("enforces composite foreign keys for tenant, company, and overridden field", async () => {
    const company = await create("Foreign key owner");
    const second = await create("Foreign key other");
    const assertion: Assertion = {
      id: randomUUID(),
      firmId,
      companyId: company.id,
      field: "description",
      value: "Evidence",
      sourceUrl: "https://source.example.com",
      sourceTitle: "Source",
      observedAt: now,
      claimKind: "reported",
      reviewStatus: "unreviewed",
      superseded: false,
      createdBy: contributor.userId,
      createdAt: now,
    };
    await repository.write(
      contributor,
      randomUUID(),
      "insert assertion",
      async (tx) => {
        await tx.insertAssertion(assertion);
        return assertion;
      },
    );
    // Raw SQL bypasses application guards so these assertions prove database constraints.
    await expect(
      sql`INSERT INTO intelligence_assertions (id, firm_id, company_id, field, value, source_url, source_title, observed_at, claim_kind, created_by, created_at) VALUES (${randomUUID()}, ${otherFirmId}, ${company.id}, 'description', '"Bad tenant"'::jsonb, 'https://source.example.com', 'Source', ${now}, 'reported', 'test', ${now})`,
    ).rejects.toMatchObject({ code: "23503" });
    for (const target of [
      { companyId: second.id, field: "description" },
      { companyId: company.id, field: "headquarters" },
    ]) {
      await expect(
        sql`INSERT INTO intelligence_overrides (id, firm_id, company_id, field, assertion_id, reason, created_by, created_at) VALUES (${randomUUID()}, ${firmId}, ${target.companyId}, ${target.field}, ${assertion.id}, 'Invalid association', 'test', ${now})`,
      ).rejects.toMatchObject({ code: "23503" });
    }
  });

  it("preserves evidence through review, pin, refresh, release, and stale edits", async () => {
    const company = await create("Evidence history");
    let profile = await service.addAssertion(
      contributor,
      company.id,
      assertionInput(1),
    );
    const original = profile.assertions[0];
    profile = await service.reviewAssertion(
      administrator,
      company.id,
      original.id,
      {
        requestId: randomUUID(),
        expectedVersion: 2,
        reviewStatus: "verified",
        reason: "Checked source",
      },
    );
    profile = await service.setOverride(contributor, company.id, {
      requestId: randomUUID(),
      expectedVersion: 3,
      field: "description",
      assertionId: original.id,
      reason: "Preferred verified report",
    });
    const overrideId = profile.overrides[0].id;
    profile = await service.addAssertion(
      contributor,
      company.id,
      assertionInput(4, "Alternative description"),
    );
    expect(profile.fields.description.assertionId).toBe(original.id);
    expect(profile.assertions).toHaveLength(2);
    expect(
      profile.assertions.find((assertion) => assertion.id === original.id),
    ).toMatchObject({
      sourceUrl: original.sourceUrl,
      sourceTitle: original.sourceTitle,
      observedAt: original.observedAt,
      reviewStatus: "verified",
    });
    await expect(
      service.addAssertion(
        contributor,
        company.id,
        assertionInput(1, "Stale change"),
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    profile = await service.releaseOverride(
      contributor,
      company.id,
      overrideId,
      {
        requestId: randomUUID(),
        expectedVersion: 5,
        reason: "Return to source resolution",
      },
    );
    expect(profile.company.version).toBe(6);
    expect(profile.overrides[0]).toMatchObject({
      id: overrideId,
      active: false,
    });
    expect(profile.assertions).toHaveLength(2);
    expect(profile.fields.description.overrideId).toBeNull();
    expect(
      await sql`SELECT id FROM intelligence_audit WHERE company_id = ${company.id}`,
    ).toHaveLength(6);
  });

  it("paginates every matching company once and excludes other firms", async () => {
    const prefix = `Page ${randomUUID()}`;
    const created = await Promise.all(
      Array.from({ length: 7 }, (_, i) => create(`${prefix} ${i}`)),
    );
    await create(`${prefix} outsider`, outsider);
    const seen: string[] = [];
    let after: string | null = null;
    do {
      const page = await service.listCompanies(viewer, {
        q: prefix,
        limit: 2,
        after,
      });
      expect(page.companies.length).toBeGreaterThan(0);
      expect(page.companies.length).toBeLessThanOrEqual(2);
      seen.push(...page.companies.map((company) => company.id));
      after = page.nextCursor;
    } while (after);
    expect(seen).toEqual(created.map((company) => company.id).sort());
    expect(new Set(seen).size).toBe(7);
  });
});
