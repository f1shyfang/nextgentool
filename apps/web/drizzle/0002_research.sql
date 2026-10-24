CREATE TABLE "research_firms" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "state" jsonb DEFAULT '{"companies":[],"deals":[],"documents":[],"records":[],"audit":[]}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_memberships" (
  "user_id" text PRIMARY KEY NOT NULL,
  "firm_id" uuid NOT NULL,
  "role" text NOT NULL,
  CONSTRAINT "research_memberships_role_check" CHECK ("role" IN ('viewer', 'contributor', 'admin')),
  CONSTRAINT "research_memberships_firm_id_research_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "research_firms"("id")
);
