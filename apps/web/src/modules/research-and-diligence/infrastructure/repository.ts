import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  type Actor,
  ResearchError,
  type ResearchRepository,
} from "../domain/types";
import { researchFirms, researchMemberships } from "./schema";

/** No environment access: callers explicitly choose the database. */
export function createResearchRepository(
  databaseUrl: string,
): ResearchRepository & { close(): Promise<void> } {
  const client = postgres(databaseUrl);
  const db = drizzle(client);
  const membership = (actor: Actor) =>
    and(
      eq(researchMemberships.userId, actor.userId),
      eq(researchMemberships.firmId, actor.firmId),
      eq(researchMemberships.role, actor.role),
    );
  return {
    async actorFor(userId) {
      if (!userId) return null;
      const [actor] = await db
        .select()
        .from(researchMemberships)
        .where(eq(researchMemberships.userId, userId));
      return actor ?? null;
    },
    async read(actor) {
      const [row] = await db
        .select({ state: researchFirms.state })
        .from(researchFirms)
        .innerJoin(
          researchMemberships,
          eq(researchMemberships.firmId, researchFirms.id),
        )
        .where(and(eq(researchFirms.id, actor.firmId), membership(actor)));
      if (!row)
        throw new ResearchError(
          "forbidden",
          "Firm membership has changed. Sign in again.",
        );
      return row.state;
    },
    async transact(actor, fn) {
      return db.transaction(async (tx) => {
        // Every writer locks the firm before inspecting membership or changing its aggregate.
        const [firm] = await tx
          .select()
          .from(researchFirms)
          .where(eq(researchFirms.id, actor.firmId))
          .for("update");
        if (!firm)
          throw new ResearchError("forbidden", "Firm access is unavailable.");
        const [member] = await tx
          .select()
          .from(researchMemberships)
          .where(membership(actor))
          .for("share");
        if (!member)
          throw new ResearchError(
            "forbidden",
            "You cannot change research in this firm.",
          );
        const result = await fn(firm.state);
        await tx
          .update(researchFirms)
          .set({ state: firm.state })
          .where(eq(researchFirms.id, actor.firmId));
        return result;
      });
    },
    async close() {
      await client.end();
    },
  };
}
