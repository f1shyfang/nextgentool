import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  pipelineFirms as firms,
  pipelineMembers as members,
} from "../src/modules/deal-pipeline/infrastructure/schema";
import { database } from "../src/modules/users/infrastructure/database";

const { values } = parseArgs({
  options: {
    "user-id": { type: "string" },
    name: { type: "string" },
    "firm-id": { type: "string" },
    "firm-name": { type: "string" },
    "research-firm-id": { type: "string" },
    disable: { type: "boolean", default: false },
  },
});
try {
  const userId = z
    .string()
    .regex(/^user_[a-zA-Z0-9]+$/)
    .parse(values["user-id"]);
  if (values.disable) {
    const rows = await database
      .update(members)
      .set({ enabled: false })
      .where(eq(members.clerkUserId, userId))
      .returning({ id: members.id });
    if (!rows.length)
      throw new Error("No pipeline membership exists for that user.");
    console.log("Pipeline membership disabled.");
  } else {
    const name = z.string().trim().min(1).max(160).parse(values.name);
    const firmId = values["firm-id"]
      ? z.string().uuid().parse(values["firm-id"])
      : crypto.randomUUID();
    await database.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(members)
        .where(eq(members.clerkUserId, userId));
      if (prior && prior.firmId !== firmId)
        throw new Error(
          `User already belongs to firm ${prior.firmId}. Use its firm ID; reassigning historical records is unsupported.`,
        );
      if (values["firm-id"]) {
        const [firm] = await tx
          .select()
          .from(firms)
          .where(eq(firms.id, firmId));
        if (!firm)
          throw new Error(
            "Firm not found. Omit --firm-id and supply --firm-name to create a firm.",
          );
      } else {
        const firmName = z
          .string()
          .trim()
          .min(1)
          .max(160)
          .parse(values["firm-name"]);
        await tx.insert(firms).values({ id: firmId, name: firmName });
      }
      if (values["research-firm-id"]) {
        const researchFirmId = z.uuid().parse(values["research-firm-id"]);
        // Explicit administrator mapping, never inferred from names or shared users.
        await tx
          .update(firms)
          .set({ researchFirmId })
          .where(eq(firms.id, firmId));
      }
      if (prior)
        await tx
          .update(members)
          .set({ name, enabled: true })
          .where(and(eq(members.id, prior.id), eq(members.firmId, firmId)));
      else
        await tx.insert(members).values({ firmId, clerkUserId: userId, name });
    });
    console.log(`Pipeline membership enabled. Firm ID: ${firmId}`);
  }
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Supply a Clerk --user-id, --name and either --firm-id or --firm-name. See docs/plans/deal-pipeline-setup.md."
      : error instanceof Error
        ? error.message
        : "Provisioning failed.",
  );
  process.exitCode = 1;
} finally {
  await database.$client.end();
}
