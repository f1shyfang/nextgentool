import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { emptyState, type ResearchState, type Role } from "../domain/types";

export const researchFirms = pgTable("research_firms", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  state: jsonb("state").$type<ResearchState>().notNull().default(emptyState()),
});

export const researchMemberships = pgTable(
  "research_memberships",
  {
    userId: text("user_id").primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => researchFirms.id),
    role: text("role").$type<Role>().notNull(),
  },
  (table) => [
    check(
      "research_memberships_role_check",
      sql`${table.role} IN ('viewer', 'contributor', 'admin')`,
    ),
  ],
);
