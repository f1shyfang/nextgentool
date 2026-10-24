import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  researchFirms,
  researchMemberships,
} from "../../research-and-diligence/infrastructure/schema";
import type {
  SignalDetail,
  SignalRepository,
  SignalTransaction,
} from "../domain/signal-types";
import {
  type Actor,
  CompanyError,
  type CompanyRepository,
  type CompanyTransaction,
} from "../domain/types";
import {
  intelligenceAssertions as assertions,
  intelligenceAudit as audit,
  intelligenceCompanies as companies,
  intelligenceFinancing as financing,
  intelligenceOverrides as overrides,
  intelligenceRequests as requests,
  intelligenceSignalRevisions as revisions,
  intelligenceSignals as signals,
} from "./schema";

export function createCompanyRepository(
  databaseUrl: string,
): CompanyRepository & { signals: SignalRepository; close(): Promise<void> } {
  const client = postgres(databaseUrl);
  const db = drizzle(client);
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const memberScope = (actor: Actor) =>
    and(
      eq(researchMemberships.userId, actor.userId),
      eq(researchMemberships.firmId, actor.firmId),
      eq(researchMemberships.role, actor.role),
    );
  const companyScope = (actor: Actor, id: string) =>
    and(eq(companies.firmId, actor.firmId), eq(companies.id, id));
  const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

  function transactionPort(
    tx: Transaction,
    actor: Actor,
    writable: boolean,
  ): CompanyTransaction & SignalTransaction {
    function requireWrite() {
      if (!writable)
        throw new CompanyError(
          "forbidden",
          "This operation cannot change company records.",
        );
    }
    return {
      async listCompanies(query) {
        const conditions = [eq(companies.firmId, actor.firmId)];
        if (query.after) conditions.push(gt(companies.id, query.after));
        if (query.q) {
          const match = or(
            ilike(companies.name, `%${escapeLike(query.q)}%`),
            ilike(companies.domain, `%${escapeLike(query.q)}%`),
          );
          if (match) conditions.push(match);
        }
        return tx
          .select()
          .from(companies)
          .where(and(...conditions))
          .orderBy(asc(companies.id))
          .limit(query.limit);
      },
      async candidates(name, domain) {
        const match = domain
          ? or(
              eq(sql<string>`lower(${companies.name})`, name.toLowerCase()),
              eq(companies.domain, domain),
            )
          : eq(sql<string>`lower(${companies.name})`, name.toLowerCase());
        return tx
          .select()
          .from(companies)
          .where(and(eq(companies.firmId, actor.firmId), match))
          .orderBy(asc(companies.id))
          .limit(100);
      },
      async getCompany(id) {
        const [company] = await tx
          .select()
          .from(companies)
          .where(companyScope(actor, id));
        return company ?? null;
      },
      async insertCompany(company) {
        requireWrite();
        if (company.firmId !== actor.firmId)
          throw new CompanyError(
            "forbidden",
            "The company belongs to another firm.",
          );
        await tx.insert(companies).values(company);
      },
      async bumpVersion(id, expectedVersion, updatedAt) {
        requireWrite();
        const changed = await tx
          .update(companies)
          .set({ version: expectedVersion + 1, updatedAt })
          .where(
            and(
              companyScope(actor, id),
              eq(companies.version, expectedVersion),
            ),
          )
          .returning({ id: companies.id });
        if (!changed.length)
          throw new CompanyError(
            "conflict",
            "The company has changed. Reload before saving.",
          );
      },
      async assertions(companyId) {
        return tx
          .select()
          .from(assertions)
          .where(
            and(
              eq(assertions.firmId, actor.firmId),
              eq(assertions.companyId, companyId),
            ),
          )
          .orderBy(asc(assertions.createdAt), asc(assertions.id));
      },
      async insertAssertion(assertion) {
        requireWrite();
        if (assertion.firmId !== actor.firmId)
          throw new CompanyError(
            "forbidden",
            "The assertion belongs to another firm.",
          );
        await tx.insert(assertions).values(assertion);
      },
      async reviewAssertion(id, companyId, status) {
        requireWrite();
        const changed = await tx
          .update(assertions)
          .set({ reviewStatus: status })
          .where(
            and(
              eq(assertions.firmId, actor.firmId),
              eq(assertions.companyId, companyId),
              eq(assertions.id, id),
            ),
          )
          .returning({ id: assertions.id });
        if (!changed.length)
          throw new CompanyError("not_found", "The assertion was not found.");
      },
      async overrides(companyId) {
        return tx
          .select()
          .from(overrides)
          .where(
            and(
              eq(overrides.firmId, actor.firmId),
              eq(overrides.companyId, companyId),
            ),
          )
          .orderBy(asc(overrides.createdAt), asc(overrides.id));
      },
      async releaseOverrides(companyId, field) {
        requireWrite();
        await tx
          .update(overrides)
          .set({ active: false })
          .where(
            and(
              eq(overrides.firmId, actor.firmId),
              eq(overrides.companyId, companyId),
              eq(overrides.field, field),
              eq(overrides.active, true),
            ),
          );
      },
      async insertOverride(override) {
        requireWrite();
        if (override.firmId !== actor.firmId)
          throw new CompanyError(
            "forbidden",
            "The override belongs to another firm.",
          );
        await tx.insert(overrides).values(override);
      },
      async appendAudit(event) {
        requireWrite();
        if (event.firmId !== actor.firmId || event.actorId !== actor.userId)
          throw new CompanyError("forbidden", "Invalid company audit context.");
        await tx.insert(audit).values(event);
      },
      async listSignals(companyId) {
        const records = await tx
          .select()
          .from(signals)
          .where(
            and(
              eq(signals.firmId, actor.firmId),
              eq(signals.companyId, companyId),
            ),
          )
          .orderBy(desc(signals.createdAt), desc(signals.id));
        const history = await tx
          .select()
          .from(revisions)
          .where(
            and(
              eq(revisions.firmId, actor.firmId),
              eq(revisions.companyId, companyId),
            ),
          )
          .orderBy(asc(revisions.revision));
        return records.map((signal) => ({
          signal,
          revisions: history.filter(
            (revision) => revision.signalId === signal.id,
          ),
        }));
      },
      async getSignal(companyId, signalId) {
        const [signal] = await tx
          .select()
          .from(signals)
          .where(
            and(
              eq(signals.firmId, actor.firmId),
              eq(signals.companyId, companyId),
              eq(signals.id, signalId),
            ),
          );
        if (!signal) return null;
        const history = await tx
          .select()
          .from(revisions)
          .where(
            and(
              eq(revisions.firmId, actor.firmId),
              eq(revisions.companyId, companyId),
              eq(revisions.signalId, signalId),
            ),
          )
          .orderBy(asc(revisions.revision));
        return { signal, revisions: history } satisfies SignalDetail;
      },
      async findDuplicate(companyId, key, excludeId) {
        const conditions = [
          eq(signals.firmId, actor.firmId),
          eq(signals.companyId, companyId),
          eq(signals.duplicateKey, key),
        ];
        if (excludeId) conditions.push(ne(signals.id, excludeId));
        const [match] = await tx
          .select()
          .from(signals)
          .where(and(...conditions))
          .orderBy(asc(signals.id))
          .limit(1);
        return match ?? null;
      },
      async insertSignal(signal) {
        requireWrite();
        if (signal.firmId !== actor.firmId)
          throw new CompanyError(
            "forbidden",
            "The signal belongs to another firm.",
          );
        await tx.insert(signals).values(signal);
      },
      async saveSignal(signal, expectedVersion) {
        requireWrite();
        if (signal.firmId !== actor.firmId)
          throw new CompanyError(
            "forbidden",
            "The signal belongs to another firm.",
          );
        const changed = await tx
          .update(signals)
          .set({
            version: signal.version,
            duplicateKey: signal.duplicateKey,
            updatedAt: signal.updatedAt,
          })
          .where(
            and(
              eq(signals.firmId, actor.firmId),
              eq(signals.companyId, signal.companyId),
              eq(signals.id, signal.id),
              eq(signals.version, expectedVersion),
            ),
          )
          .returning({ id: signals.id });
        if (!changed.length)
          throw new CompanyError(
            "conflict",
            "The signal has changed. Load its latest revision.",
          );
      },
      async appendRevision(revision) {
        requireWrite();
        if (
          revision.firmId !== actor.firmId ||
          revision.createdBy !== actor.userId
        )
          throw new CompanyError(
            "forbidden",
            "Invalid signal revision context.",
          );
        await tx.insert(revisions).values(revision);
      },
      async replaceFinancing(companyId, signalId, row) {
        requireWrite();
        await tx
          .delete(financing)
          .where(
            and(
              eq(financing.firmId, actor.firmId),
              eq(financing.companyId, companyId),
              eq(financing.signalId, signalId),
            ),
          );
        if (row) {
          if (
            row.firmId !== actor.firmId ||
            row.companyId !== companyId ||
            row.signalId !== signalId
          )
            throw new CompanyError(
              "forbidden",
              "Invalid financing projection context.",
            );
          await tx.insert(financing).values(row);
        }
      },
      async financingHistory(companyId, filters) {
        const conditions = [
          eq(financing.firmId, actor.firmId),
          eq(financing.companyId, companyId),
        ];
        if (filters.currency)
          conditions.push(eq(financing.currency, filters.currency));
        if (filters.roundType)
          conditions.push(eq(financing.roundType, filters.roundType));
        if (filters.minAmount !== undefined)
          conditions.push(gte(financing.amount, filters.minAmount));
        if (filters.maxAmount !== undefined)
          conditions.push(lte(financing.amount, filters.maxAmount));
        if (filters.from) conditions.push(gte(financing.dateEnd, filters.from));
        if (filters.to) conditions.push(lte(financing.dateStart, filters.to));
        return tx
          .select()
          .from(financing)
          .where(and(...conditions))
          .orderBy(
            sql`${financing.dateStart} DESC NULLS LAST`,
            desc(financing.createdAt),
            desc(financing.signalId),
          );
      },
    };
  }

  const access = {
    async read<T>(
      actor: Actor,
      operation: (tx: CompanyTransaction & SignalTransaction) => Promise<T>,
    ): Promise<T> {
      return db.transaction(
        async (tx) => {
          const [membership] = await tx
            .select()
            .from(researchMemberships)
            .where(memberScope(actor));
          if (!membership)
            throw new CompanyError(
              "forbidden",
              "Your firm membership has changed. Sign in again.",
            );
          return operation(transactionPort(tx, actor, false));
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async write<T>(
      actor: Actor,
      requestId: string,
      fingerprint: string,
      operation: (tx: CompanyTransaction & SignalTransaction) => Promise<T>,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        // Match Research administration's lock order so revocation cannot race an authorized write.
        const [firm] = await tx
          .select({ id: researchFirms.id })
          .from(researchFirms)
          .where(eq(researchFirms.id, actor.firmId))
          .for("update");
        const [membership] = await tx
          .select()
          .from(researchMemberships)
          .where(memberScope(actor))
          .for("share");
        if (!firm || !membership || actor.role === "viewer")
          throw new CompanyError(
            "forbidden",
            "You cannot change company records in this firm.",
          );
        const scope = and(
          eq(requests.firmId, actor.firmId),
          eq(requests.actorId, actor.userId),
          eq(requests.requestId, requestId),
        );
        const [previous] = await tx.select().from(requests).where(scope);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new CompanyError(
              "conflict",
              "The request ID was already used for different changes.",
            );
          return previous.result as T;
        }
        const result = await operation(transactionPort(tx, actor, true));
        await tx.insert(requests).values({
          firmId: actor.firmId,
          actorId: actor.userId,
          requestId,
          fingerprint,
          result,
        });
        return result;
      });
    },
  };
  return {
    ...access,
    signals: access,
    async actorFor(userId) {
      const [actor] = await db
        .select()
        .from(researchMemberships)
        .where(eq(researchMemberships.userId, userId));
      return actor ?? null;
    },
    async close() {
      await client.end();
    },
  };
}
