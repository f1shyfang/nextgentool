CREATE TYPE "public"."pipeline_stage" AS ENUM('inbox', 'screening', 'evaluation', 'decision', 'passed', 'invested');--> statement-breakpoint
CREATE TABLE "pipeline_deals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"company_id" uuid,
	"company_name" varchar(160) NOT NULL,
	"company_href" text,
	"stage" "pipeline_stage" NOT NULL,
	"owner_id" uuid NOT NULL,
	"next_step" varchar(500) DEFAULT '' NOT NULL,
	"due_date" date,
	"summary" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"stage_entered_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pipeline_deal_firm_id" UNIQUE("firm_id","id"),
	CONSTRAINT "pipeline_deal_version_positive" CHECK ("pipeline_deals"."version" > 0),
	CONSTRAINT "pipeline_deal_name_present" CHECK (length(trim("pipeline_deals"."name")) > 0 AND length(trim("pipeline_deals"."company_name")) > 0),
	CONSTRAINT "pipeline_company_reference" CHECK (("pipeline_deals"."company_id" IS NULL AND "pipeline_deals"."company_href" IS NULL) OR ("pipeline_deals"."company_id" IS NOT NULL AND "pipeline_deals"."company_href" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pipeline_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" varchar(16) NOT NULL,
	"from_stage" "pipeline_stage",
	"to_stage" "pipeline_stage" NOT NULL,
	"rationale" varchar(2000) DEFAULT '' NOT NULL,
	"changes" jsonb NOT NULL,
	CONSTRAINT "pipeline_event_kind" CHECK ("pipeline_events"."kind" IN ('created', 'updated', 'moved', 'closed', 'reopened'))
);
--> statement-breakpoint
CREATE TABLE "pipeline_firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pipeline_members_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "pipeline_member_firm_id" UNIQUE("firm_id","id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_requests" (
	"firm_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_requests_firm_id_actor_id_request_id_pk" PRIMARY KEY("firm_id","actor_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "pipeline_deals" ADD CONSTRAINT "pipeline_deals_firm_id_pipeline_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."pipeline_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_deals" ADD CONSTRAINT "pipeline_deals_firm_id_owner_id_pipeline_members_firm_id_id_fk" FOREIGN KEY ("firm_id","owner_id") REFERENCES "public"."pipeline_members"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_deals" ADD CONSTRAINT "pipeline_deals_firm_id_created_by_pipeline_members_firm_id_id_fk" FOREIGN KEY ("firm_id","created_by") REFERENCES "public"."pipeline_members"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_firm_id_deal_id_pipeline_deals_firm_id_id_fk" FOREIGN KEY ("firm_id","deal_id") REFERENCES "public"."pipeline_deals"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_firm_id_actor_id_pipeline_members_firm_id_id_fk" FOREIGN KEY ("firm_id","actor_id") REFERENCES "public"."pipeline_members"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_members" ADD CONSTRAINT "pipeline_members_firm_id_pipeline_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."pipeline_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_requests" ADD CONSTRAINT "pipeline_requests_firm_id_actor_id_pipeline_members_firm_id_id_fk" FOREIGN KEY ("firm_id","actor_id") REFERENCES "public"."pipeline_members"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_deal_board" ON "pipeline_deals" USING btree ("firm_id","stage","stage_entered_at","id");--> statement-breakpoint
CREATE INDEX "pipeline_deal_owner" ON "pipeline_deals" USING btree ("firm_id","owner_id");--> statement-breakpoint
CREATE INDEX "pipeline_event_history" ON "pipeline_events" USING btree ("firm_id","deal_id","occurred_at");