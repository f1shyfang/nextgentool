import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { env } from "@repo/env/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Actor, emptyState } from "../domain/types";
import { createResearchRepository } from "./repository";

// Deliberately opt-in; each run creates and drops only its own schema.
const databaseUrl = env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL research aggregate", () => {
  const schema = `research_test_${randomUUID().replaceAll("-", "")}`;
  const firmId = randomUUID();
  const otherFirmId = randomUUID();
  const actor: Actor = {
    userId: `user_${randomUUID().replaceAll("-", "")}`,
    firmId,
    role: "contributor",
  };
  let admin: ReturnType<typeof postgres>;
  let scoped: ReturnType<typeof postgres>;
  let repository: ReturnType<typeof createResearchRepository>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("Integration tests require a local TEST_DATABASE_URL");
    admin = postgres(databaseUrl, { onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(schema)}`;
    url.searchParams.set("options", `-c search_path=${schema}`);
    scoped = postgres(url.toString());
    repository = createResearchRepository(url.toString());
    const migration = await readFile(
      new URL("../../../../drizzle/0002_research.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await scoped.unsafe(statement);
    await scoped`INSERT INTO research_firms (id, name, state) VALUES (${firmId}, 'Test firm', ${scoped.json(emptyState())}), (${otherFirmId}, 'Other firm', ${scoped.json(emptyState())})`;
    await scoped`INSERT INTO research_memberships (user_id, firm_id, role) VALUES (${actor.userId}, ${firmId}, ${actor.role})`;
  });

  afterAll(async () => {
    await repository?.close();
    await scoped?.end();
    if (admin) {
      await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      await admin.end();
    }
  });

  it("resolves actors and scopes reads to their firm and current role", async () => {
    expect(await repository.actorFor(actor.userId)).toEqual(actor);
    expect(await repository.actorFor("unknown")).toBeNull();
    expect(await repository.read(actor)).toEqual(emptyState());
    await expect(
      repository.read({ ...actor, firmId: otherFirmId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      repository.read({ ...actor, role: "admin" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rolls back mutations when the callback fails", async () => {
    await expect(
      repository.transact(actor, (state) => {
        state.companies.push({ id: randomUUID(), name: "Must roll back" });
        throw new Error("Rollback");
      }),
    ).rejects.toThrow("Rollback");
    expect((await repository.read(actor)).companies).toEqual([]);
  });

  it("serializes concurrent mutations without losing aggregate updates", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        repository.transact(actor, async (state) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          state.companies.push({ id: randomUUID(), name: `Concurrent ${i}` });
        }),
      ),
    );
    expect((await repository.read(actor)).companies).toHaveLength(8);
  });

  it("rechecks membership after waiting for the firm lock", async () => {
    let release!: () => void;
    let locked!: () => void;
    const waitForLock = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const releaseLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const demotion = scoped.begin(async (tx) => {
      await tx`SELECT id FROM research_firms WHERE id = ${firmId} FOR UPDATE`;
      locked();
      await releaseLock;
      await tx`UPDATE research_memberships SET role = 'viewer' WHERE user_id = ${actor.userId} AND firm_id = ${firmId}`;
    });
    await waitForLock;
    let callbackRan = false;
    const mutation = repository.transact(actor, () => {
      callbackRan = true;
    });
    const rejected = expect(mutation).rejects.toMatchObject({
      code: "forbidden",
    });
    release();
    await demotion;
    await rejected;
    expect(callbackRan).toBe(false);
    await repository.transact({ ...actor, role: "viewer" }, (state) => {
      state.audit.push({
        id: randomUUID(),
        actor: actor.userId,
        action: "document.download",
        targetId: "test-document",
        createdAt: new Date().toISOString(),
      });
    });
    expect(
      (await repository.read({ ...actor, role: "viewer" })).audit.at(-1)
        ?.action,
    ).toBe("document.download");
    await scoped`DELETE FROM research_memberships WHERE user_id = ${actor.userId} AND firm_id = ${firmId}`;
    expect(await repository.actorFor(actor.userId)).toBeNull();
    await expect(repository.read(actor)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
