CREATE TABLE "intelligence_assertions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_url" text NOT NULL,
	"source_title" varchar(300) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"claim_kind" text NOT NULL,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_assertion_company_field_id" UNIQUE("firm_id","company_id","field","id"),
	CONSTRAINT "intelligence_assertion_field" CHECK ("intelligence_assertions"."field" IN ('description', 'sector', 'businessModel', 'headquarters', 'foundingYear', 'operatingMarkets')),
	CONSTRAINT "intelligence_assertion_claim" CHECK ("intelligence_assertions"."claim_kind" IN ('reported', 'estimated', 'manual')),
	CONSTRAINT "intelligence_assertion_review" CHECK ("intelligence_assertions"."review_status" IN ('unreviewed', 'verified', 'disputed', 'rejected')),
	CONSTRAINT "intelligence_assertion_source_present" CHECK (length(trim("intelligence_assertions"."source_title")) > 0 AND length(trim("intelligence_assertions"."source_url")) > 0)
);
--> statement-breakpoint
CREATE TABLE "intelligence_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"domain" varchar(253),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_company_firm_id" UNIQUE("firm_id","id"),
	CONSTRAINT "intelligence_company_name_present" CHECK (length(trim("intelligence_companies"."name")) > 0),
	CONSTRAINT "intelligence_company_version_positive" CHECK ("intelligence_companies"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "intelligence_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"field" text NOT NULL,
	"assertion_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reason" varchar(2000) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_override_reason_present" CHECK (length(trim("intelligence_overrides"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "intelligence_requests" (
	"firm_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intelligence_requests_firm_id_actor_id_request_id_pk" PRIMARY KEY("firm_id","actor_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "intelligence_assertions" ADD CONSTRAINT "intelligence_assertions_firm_id_company_id_intelligence_companies_firm_id_id_fk" FOREIGN KEY ("firm_id","company_id") REFERENCES "public"."intelligence_companies"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_audit" ADD CONSTRAINT "intelligence_audit_firm_id_company_id_intelligence_companies_firm_id_id_fk" FOREIGN KEY ("firm_id","company_id") REFERENCES "public"."intelligence_companies"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_companies" ADD CONSTRAINT "intelligence_companies_firm_id_research_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."research_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_overrides" ADD CONSTRAINT "intelligence_overrides_firm_id_company_id_field_assertion_id_intelligence_assertions_firm_id_company_id_field_id_fk" FOREIGN KEY ("firm_id","company_id","field","assertion_id") REFERENCES "public"."intelligence_assertions"("firm_id","company_id","field","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_requests" ADD CONSTRAINT "intelligence_requests_firm_id_research_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."research_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_assertion_history" ON "intelligence_assertions" USING btree ("firm_id","company_id","field");--> statement-breakpoint
CREATE INDEX "intelligence_audit_history" ON "intelligence_audit" USING btree ("firm_id","company_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_company_directory" ON "intelligence_companies" USING btree ("firm_id","id");--> statement-breakpoint
CREATE INDEX "intelligence_company_domain" ON "intelligence_companies" USING btree ("firm_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_override_active_field" ON "intelligence_overrides" USING btree ("firm_id","company_id","field") WHERE "intelligence_overrides"."active" = true;