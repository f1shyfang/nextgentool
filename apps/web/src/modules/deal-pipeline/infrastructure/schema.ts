import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { researchFirms } from "../../research-and-diligence/infrastructure/schema";
import { type Deal, type DealEvent, STAGES } from "../domain/pipeline";

export const pipelineStage = pgEnum("pipeline_stage", STAGES);
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
export const pipelineFirms = pgTable("pipeline_firms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  researchFirmId: uuid("research_firm_id").references(() => researchFirms.id),
  createdAt: time("created_at").defaultNow().notNull(),
});
export const pipelineMembers = pgTable(
  "pipeline_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => pipelineFirms.id),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
  },
  (table) => [unique("pipeline_member_firm_id").on(table.firmId, table.id)],
);
export const pipelineDeals = pgTable(
  "pipeline_deals",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => pipelineFirms.id),
    name: varchar("name", { length: 200 }).notNull(),
    companyId: uuid("company_id"),
    companyName: varchar("company_name", { length: 200 }).notNull(),
    companyHref: text("company_href"),
    stage: pipelineStage("stage").notNull(),
    ownerId: uuid("owner_id").notNull(),
    nextStep: varchar("next_step", { length: 500 }).default("").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    summary: text("summary").default("").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    stageEnteredAt: time("stage_entered_at").notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("pipeline_deal_firm_id").on(table.firmId, table.id),
    foreignKey({
      columns: [table.firmId, table.ownerId],
      foreignColumns: [pipelineMembers.firmId, pipelineMembers.id],
    }),
    foreignKey({
      columns: [table.firmId, table.createdBy],
      foreignColumns: [pipelineMembers.firmId, pipelineMembers.id],
    }),
    check("pipeline_deal_version_positive", sql`${table.version} > 0`),
    check(
      "pipeline_deal_name_present",
      sql`length(trim(${table.name})) > 0 AND length(trim(${table.companyName})) > 0`,
    ),
    check(
      "pipeline_company_reference",
      sql`(${table.companyId} IS NULL AND ${table.companyHref} IS NULL) OR (${table.companyId} IS NOT NULL AND ${table.companyHref} IS NOT NULL)`,
    ),
    index("pipeline_deal_board").on(
      table.firmId,
      table.stage,
      table.stageEnteredAt,
      table.id,
    ),
    index("pipeline_deal_owner").on(table.firmId, table.ownerId),
  ],
);
export const pipelineEvents = pgTable(
  "pipeline_events",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").notNull(),
    dealId: uuid("deal_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    occurredAt: time("occurred_at").notNull(),
    kind: varchar("kind", { length: 16 }).$type<DealEvent["kind"]>().notNull(),
    fromStage: pipelineStage("from_stage"),
    toStage: pipelineStage("to_stage").notNull(),
    rationale: varchar("rationale", { length: 2000 }).default("").notNull(),
    changes: jsonb("changes").$type<DealEvent["changes"]>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.firmId, table.dealId],
      foreignColumns: [pipelineDeals.firmId, pipelineDeals.id],
    }),
    foreignKey({
      columns: [table.firmId, table.actorId],
      foreignColumns: [pipelineMembers.firmId, pipelineMembers.id],
    }),
    index("pipeline_event_history").on(
      table.firmId,
      table.dealId,
      table.occurredAt,
    ),
    check(
      "pipeline_event_kind",
      sql`${table.kind} IN ('created', 'updated', 'moved', 'closed', 'reopened')`,
    ),
  ],
);
export const pipelineRequests = pgTable(
  "pipeline_requests",
  {
    firmId: uuid("firm_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<Deal>().notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.firmId, table.actorId, table.requestId] }),
    foreignKey({
      columns: [table.firmId, table.actorId],
      foreignColumns: [pipelineMembers.firmId, pipelineMembers.id],
    }),
  ],
);
