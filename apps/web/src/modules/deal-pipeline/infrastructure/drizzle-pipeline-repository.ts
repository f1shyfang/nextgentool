import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { database } from "../../users/infrastructure/database";
import {
  ACTIVE_STAGES,
  type Deal,
  type PipelineContext,
  PipelineError,
  STAGES,
  type Stage,
} from "../domain/pipeline";
import type { PipelineRepository } from "../domain/ports";
import {
  pipelineDeals as deals,
  pipelineEvents as events,
  pipelineFirms as firms,
  pipelineMembers as members,
  pipelineRequests as requests,
} from "./schema";

const memberScope = (context: PipelineContext) =>
  and(
    eq(members.id, context.memberId),
    eq(members.firmId, context.firmId),
    eq(members.enabled, true),
  );
const dealScope = (context: PipelineContext, id: string) =>
  and(eq(deals.firmId, context.firmId), eq(deals.id, id));

export function createDrizzlePipelineRepository(): PipelineRepository {
  async function requireMembership(context: PipelineContext) {
    const [member] = await database
      .select({ id: members.id })
      .from(members)
      .where(memberScope(context))
      .limit(1);
    if (!member)
      throw new PipelineError(
        "forbidden",
        "Your pipeline access has changed. Contact your firm administrator.",
      );
  }
  return {
    async memberForUser(clerkUserId) {
      const [member] = await database
        .select({
          firmId: members.firmId,
          memberId: members.id,
          name: members.name,
          firmName: firms.name,
        })
        .from(members)
        .innerJoin(firms, eq(members.firmId, firms.id))
        .where(
          and(eq(members.clerkUserId, clerkUserId), eq(members.enabled, true)),
        )
        .limit(1);
      return member ?? null;
    },
    async members(context) {
      await requireMembership(context);
      return database
        .select({ id: members.id, name: members.name })
        .from(members)
        .where(
          and(eq(members.firmId, context.firmId), eq(members.enabled, true)),
        )
        .orderBy(asc(members.name), asc(members.id));
    },
    async list(context, filters) {
      await requireMembership(context);
      const conditions = [eq(deals.firmId, context.firmId)];
      if (filters.owner) conditions.push(eq(deals.ownerId, filters.owner));
      if (filters.stage) conditions.push(eq(deals.stage, filters.stage));
      if (filters.scope === "closed")
        conditions.push(inArray(deals.stage, ["passed", "invested"]));
      else if (filters.scope !== "all")
        conditions.push(inArray(deals.stage, [...ACTIVE_STAGES]));
      if (filters.q) {
        const query = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
        const match = or(
          ilike(deals.name, query),
          ilike(deals.companyName, query),
        );
        if (match) conditions.push(match);
      }
      const result = await database
        .select()
        .from(deals)
        .where(and(...conditions))
        .orderBy(desc(deals.stageEnteredAt), asc(deals.id));
      const counts = Object.fromEntries(
        STAGES.map((stage) => [stage, 0]),
      ) as Record<Stage, number>;
      for (const deal of result) counts[deal.stage]++;
      return { deals: result, counts };
    },
    async detail(context, id) {
      await requireMembership(context);
      return database.transaction(
        async (tx) => {
          const [deal] = await tx
            .select()
            .from(deals)
            .where(dealScope(context, id));
          if (!deal) return null;
          const history = await tx
            .select()
            .from(events)
            .where(
              and(eq(events.firmId, context.firmId), eq(events.dealId, id)),
            )
            .orderBy(asc(events.occurredAt), asc(events.id));
          return { deal, events: history };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async mutate(context, requestId, fingerprint, operation) {
      return database.transaction(async (tx) => {
        // A shared membership lock keeps revocation from racing an authorized write.
        const [member] = await tx
          .select({ id: members.id })
          .from(members)
          .where(memberScope(context))
          .for("share");
        if (!member)
          throw new PipelineError(
            "forbidden",
            "Your pipeline access has changed. Contact your firm administrator.",
          );
        // Serialize retries before reading the saved result, including simultaneous requests.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${context.firmId}:${context.memberId}:${requestId}`}, 0))`,
        );
        const requestScope = and(
          eq(requests.firmId, context.firmId),
          eq(requests.actorId, context.memberId),
          eq(requests.requestId, requestId),
        );
        const [previous] = await tx.select().from(requests).where(requestScope);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new PipelineError(
              "conflict",
              "This request identifier was already used for different changes. Reload and try again.",
            );
          return previous.result;
        }
        const result = await operation({
          async getDeal(id) {
            const [deal] = await tx
              .select()
              .from(deals)
              .where(dealScope(context, id))
              .for("update");
            return deal ?? null;
          },
          async ownerExists(id) {
            const [owner] = await tx
              .select({ id: members.id })
              .from(members)
              .where(
                and(
                  eq(members.firmId, context.firmId),
                  eq(members.id, id),
                  eq(members.enabled, true),
                ),
              )
              .for("share");
            return Boolean(owner);
          },
          async insertDeal(deal) {
            await tx.insert(deals).values(deal);
          },
          async saveDeal(deal: Deal, expectedVersion) {
            const updated = await tx
              .update(deals)
              .set(deal)
              .where(
                and(
                  dealScope(context, deal.id),
                  eq(deals.version, expectedVersion),
                ),
              )
              .returning({ id: deals.id });
            if (!updated.length)
              throw new PipelineError(
                "conflict",
                "This deal has changed. Reload it before saving again.",
              );
          },
          async appendEvent(event) {
            await tx
              .insert(events)
              .values({ ...event, firmId: context.firmId });
          },
        });
        await tx.insert(requests).values({
          firmId: context.firmId,
          actorId: context.memberId,
          requestId,
          fingerprint,
          result,
        });
        return result;
      });
    },
  };
}
