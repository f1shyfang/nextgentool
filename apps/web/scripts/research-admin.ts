/** Offline provisioning for the MVP's local canonical company/deal reference registry. */
import { randomUUID } from "node:crypto";
import { env } from "@repo/env/server";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { emptyState } from "../src/modules/research-and-diligence/domain/types";
import {
  researchFirms,
  researchMemberships,
} from "../src/modules/research-and-diligence/infrastructure/schema";

const uuid = z.uuid();
const name = z.string().trim().min(1).max(200);
const clerkUser = z
  .string()
  .regex(/^user_[A-Za-z0-9]+$/, "Expected a Clerk user ID");
const role = z.enum(["viewer", "contributor", "admin"]);
const commands = {
  init: z.tuple([uuid, name, clerkUser]),
  membership: z.tuple([uuid, clerkUser, role]),
  revoke: z.tuple([uuid, clerkUser]),
  company: z.tuple([uuid, uuid, name]),
  deal: z.tuple([uuid, uuid, uuid, name]),
};
const [command, ...args] = process.argv.slice(2);
if (!(command in commands)) {
  throw new Error(
    "Usage: research-admin init <firm-id> <name> <Clerk-user-id> | membership <firm-id> <Clerk-user-id> <viewer|contributor|admin> | revoke <firm-id> <Clerk-user-id> | company <firm-id> <company-id> <name> | deal <firm-id> <deal-id> <company-id> <name>",
  );
}
commands[command as keyof typeof commands].parse(args);
const client = postgres(env.DATABASE_URL);
const db = drizzle(client);
try {
  await db.transaction(async (tx) => {
    const firmId = args[0];
    if (command === "init") {
      await tx
        .insert(researchFirms)
        .values({ id: firmId, name: args[1].trim(), state: emptyState() });
      await tx
        .insert(researchMemberships)
        .values({ userId: args[2], firmId, role: "admin" });
      return;
    }
    const [firm] = await tx
      .select()
      .from(researchFirms)
      .where(eq(researchFirms.id, firmId))
      .for("update");
    if (!firm) throw new Error("Firm does not exist");
    if (command === "membership") {
      const [existing] = await tx
        .select()
        .from(researchMemberships)
        .where(eq(researchMemberships.userId, args[1]))
        .for("update");
      if (existing && existing.firmId !== firmId)
        throw new Error(
          "User already belongs to another firm; revoke that membership first",
        );
      const nextRole = role.parse(args[2]);
      if (existing)
        await tx
          .update(researchMemberships)
          .set({ role: nextRole })
          .where(
            and(
              eq(researchMemberships.userId, args[1]),
              eq(researchMemberships.firmId, firmId),
            ),
          );
      else
        await tx
          .insert(researchMemberships)
          .values({ userId: args[1], firmId, role: nextRole });
    } else if (command === "revoke") {
      const removed = await tx
        .delete(researchMemberships)
        .where(
          and(
            eq(researchMemberships.userId, args[1]),
            eq(researchMemberships.firmId, firmId),
          ),
        )
        .returning();
      if (!removed.length)
        throw new Error("Membership does not exist in this firm");
    } else if (command === "company") {
      if (firm.state.companies.some((company) => company.id === args[1]))
        throw new Error("Company reference already exists");
      firm.state.companies.push({ id: args[1], name: args[2].trim() });
    } else if (command === "deal") {
      if (!firm.state.companies.some((company) => company.id === args[2]))
        throw new Error("Company reference does not exist in this firm");
      if (firm.state.deals.some((deal) => deal.id === args[1]))
        throw new Error("Deal reference already exists");
      firm.state.deals.push({
        id: args[1],
        companyId: args[2],
        name: args[3].trim(),
      });
    }
    firm.state.audit.push({
      id: randomUUID(),
      actor: "offline-admin",
      action: `provision.${command}`,
      targetId: args[1],
      createdAt: new Date().toISOString(),
    });
    await tx
      .update(researchFirms)
      .set({ state: firm.state })
      .where(eq(researchFirms.id, firmId));
  });
  console.log(`Research ${command} completed.`);
} finally {
  await client.end();
}
