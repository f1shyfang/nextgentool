import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { researchFirms } from "../../research-and-diligence/infrastructure/schema";
import type {
  Financing,
  PartialDate,
  RoundType,
  SignalPayload,
} from "../domain/signal-types";
import type { Assertion, FactValue, Field } from "../domain/types";

const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const intelligenceCompanies = pgTable(
  "intelligence_companies",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => researchFirms.id),
    name: varchar("name", { length: 200 }).notNull(),
    domain: varchar("domain", { length: 253 }),
    version: integer("version").notNull().default(1),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (table) => [
    unique("intelligence_company_firm_id").on(table.firmId, table.id),
    check(
      "intelligence_company_name_present",
      sql`length(trim(${table.name})) > 0`,
    ),
    check("intelligence_company_version_positive", sql`${table.version} > 0`),
    index("intelligence_company_directory").on(table.firmId, table.id),
    index("intelligence_company_domain").on(table.firmId, table.domain),
  ],
);

export const intelligenceAssertions = pgTable(
  "intelligence_assertions",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    field: text("field").$type<Field>().notNull(),
    value: jsonb("value").$type<FactValue>().notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: varchar("source_title", { length: 300 }).notNull(),
    observedAt: time("observed_at").notNull(),
    claimKind: text("claim_kind").$type<Assertion["claimKind"]>().notNull(),
    reviewStatus: text("review_status")
      .$type<Assertion["reviewStatus"]>()
      .notNull()
      .default("unreviewed"),
    superseded: boolean("superseded").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.firmId, table.companyId],
      foreignColumns: [intelligenceCompanies.firmId, intelligenceCompanies.id],
    }),
    unique("intelligence_assertion_company_field_id").on(
      table.firmId,
      table.companyId,
      table.field,
      table.id,
    ),
    check(
      "intelligence_assertion_field",
      sql`${table.field} IN ('description', 'sector', 'businessModel', 'headquarters', 'foundingYear', 'operatingMarkets')`,
    ),
    check(
      "intelligence_assertion_claim",
      sql`${table.claimKind} IN ('reported', 'estimated', 'manual')`,
    ),
    check(
      "intelligence_assertion_review",
      sql`${table.reviewStatus} IN ('unreviewed', 'verified', 'disputed', 'rejected')`,
    ),
    check(
      "intelligence_assertion_source_present",
      sql`length(trim(${table.sourceTitle})) > 0 AND length(trim(${table.sourceUrl})) > 0`,
    ),
    index("intelligence_assertion_history").on(
      table.firmId,
      table.companyId,
      table.field,
    ),
  ],
);

export const intelligenceOverrides = pgTable(
  "intelligence_overrides",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    field: text("field").$type<Field>().notNull(),
    assertionId: uuid("assertion_id").notNull(),
    active: boolean("active").notNull().default(true),
    reason: varchar("reason", { length: 2000 }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.firmId, table.companyId, table.field, table.assertionId],
      foreignColumns: [
        intelligenceAssertions.firmId,
        intelligenceAssertions.companyId,
        intelligenceAssertions.field,
        intelligenceAssertions.id,
      ],
    }),
    uniqueIndex("intelligence_override_active_field")
      .on(table.firmId, table.companyId, table.field)
      .where(sql`${table.active} = true`),
    check(
      "intelligence_override_reason_present",
      sql`length(trim(${table.reason})) > 0`,
    ),
  ],
);

export const intelligenceAudit = pgTable(
  "intelligence_audit",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.firmId, table.companyId],
      foreignColumns: [intelligenceCompanies.firmId, intelligenceCompanies.id],
    }),
    index("intelligence_audit_history").on(
      table.firmId,
      table.companyId,
      table.createdAt,
    ),
  ],
);

export const intelligenceRequests = pgTable(
  "intelligence_requests",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => researchFirms.id),
    actorId: text("actor_id").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.firmId, table.actorId, table.requestId] }),
  ],
);

export const intelligenceSignals = pgTable(
  "intelligence_signals",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    version: integer("version").notNull(),
    duplicateKey: text("duplicate_key").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (table) => [
    unique("intelligence_signal_firm_company_id").on(
      table.firmId,
      table.companyId,
      table.id,
    ),
    foreignKey({
      name: "intelligence_signal_company_fk",
      columns: [table.firmId, table.companyId],
      foreignColumns: [intelligenceCompanies.firmId, intelligenceCompanies.id],
    }),
    check("intelligence_signal_version_positive", sql`${table.version} > 0`),
    index("intelligence_signal_timeline").on(
      table.firmId,
      table.companyId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const intelligenceSignalRevisions = pgTable(
  "intelligence_signal_revisions",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    signalId: uuid("signal_id").notNull(),
    revision: integer("revision").notNull(),
    payload: jsonb("payload").$type<SignalPayload>().notNull(),
    material: boolean("material").notNull(),
    reason: varchar("reason", { length: 2000 }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    unique("intelligence_signal_revision_number").on(
      table.firmId,
      table.companyId,
      table.signalId,
      table.revision,
    ),
    unique("intelligence_signal_revision_context").on(
      table.firmId,
      table.companyId,
      table.signalId,
      table.id,
    ),
    foreignKey({
      name: "intelligence_revision_signal_fk",
      columns: [table.firmId, table.companyId, table.signalId],
      foreignColumns: [
        intelligenceSignals.firmId,
        intelligenceSignals.companyId,
        intelligenceSignals.id,
      ],
    }),
    check("intelligence_signal_revision_positive", sql`${table.revision} > 0`),
    check(
      "intelligence_signal_revision_reason",
      sql`length(trim(${table.reason})) > 0`,
    ),
  ],
);

export const intelligenceFinancing = pgTable(
  "intelligence_financing",
  {
    firmId: uuid("firm_id").notNull(),
    companyId: uuid("company_id").notNull(),
    signalId: uuid("signal_id").primaryKey(),
    revisionId: uuid("revision_id").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    roundType: text("round_type").$type<RoundType>().notNull(),
    amount: numeric("amount", { precision: 24, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
    investors: jsonb("investors").$type<string[]>().notNull(),
    valuation: numeric("valuation", { precision: 24, scale: 4 }),
    valuationKind: text("valuation_kind").$type<Financing["valuationKind"]>(),
    dateStart: date("date_start", { mode: "string" }),
    dateEnd: date("date_end", { mode: "string" }),
    eventDate: jsonb("event_date").$type<PartialDate>().notNull(),
    status: text("status").$type<"unreviewed" | "verified">().notNull(),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "intelligence_financing_revision_fk",
      columns: [
        table.firmId,
        table.companyId,
        table.signalId,
        table.revisionId,
      ],
      foreignColumns: [
        intelligenceSignalRevisions.firmId,
        intelligenceSignalRevisions.companyId,
        intelligenceSignalRevisions.signalId,
        intelligenceSignalRevisions.id,
      ],
    }),
    check(
      "intelligence_financing_nonnegative",
      sql`(${table.amount} IS NULL OR ${table.amount} >= 0) AND (${table.valuation} IS NULL OR ${table.valuation} >= 0)`,
    ),
    check(
      "intelligence_financing_currency",
      sql`(${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$') AND ((${table.amount} IS NULL AND ${table.valuation} IS NULL) OR ${table.currency} IS NOT NULL)`,
    ),
    check(
      "intelligence_financing_valuation_kind",
      sql`(${table.valuation} IS NULL AND ${table.valuationKind} IS NULL) OR (${table.valuation} IS NOT NULL AND ${table.valuationKind} IS NOT NULL AND ${table.valuationKind} IN ('pre_money', 'post_money'))`,
    ),
    check(
      "intelligence_financing_round_type",
      sql`${table.roundType} IN ('pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth', 'debt', 'grant', 'other')`,
    ),
    check(
      "intelligence_financing_status",
      sql`${table.status} IN ('unreviewed', 'verified')`,
    ),
    check(
      "intelligence_financing_dates",
      sql`(${table.dateStart} IS NULL AND ${table.dateEnd} IS NULL) OR (${table.dateStart} IS NOT NULL AND ${table.dateEnd} IS NOT NULL AND ${table.dateStart} <= ${table.dateEnd})`,
    ),
    index("intelligence_financing_history").on(
      table.firmId,
      table.companyId,
      table.currency,
      table.roundType,
      table.dateStart,
    ),
  ],
);
