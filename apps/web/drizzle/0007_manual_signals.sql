CREATE TABLE "intelligence_financing" (
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"signal_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"round_type" text NOT NULL,
	"amount" numeric(24, 4),
	"currency" varchar(3),
	"investors" jsonb NOT NULL,
	"valuation" numeric(24, 4),
	"valuation_kind" text,
	"date_start" date,
	"date_end" date,
	"event_date" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_financing_nonnegative" CHECK (("intelligence_financing"."amount" IS NULL OR "intelligence_financing"."amount" >= 0) AND ("intelligence_financing"."valuation" IS NULL OR "intelligence_financing"."valuation" >= 0)),
	CONSTRAINT "intelligence_financing_currency" CHECK (("intelligence_financing"."currency" IS NULL OR "intelligence_financing"."currency" ~ '^[A-Z]{3}$') AND (("intelligence_financing"."amount" IS NULL AND "intelligence_financing"."valuation" IS NULL) OR "intelligence_financing"."currency" IS NOT NULL)),
	CONSTRAINT "intelligence_financing_valuation_kind" CHECK (("intelligence_financing"."valuation" IS NULL AND "intelligence_financing"."valuation_kind" IS NULL) OR ("intelligence_financing"."valuation" IS NOT NULL AND "intelligence_financing"."valuation_kind" IN ('pre_money', 'post_money'))),
	CONSTRAINT "intelligence_financing_status" CHECK ("intelligence_financing"."status" IN ('unreviewed', 'verified')),
	CONSTRAINT "intelligence_financing_dates" CHECK (("intelligence_financing"."date_start" IS NULL AND "intelligence_financing"."date_end" IS NULL) OR ("intelligence_financing"."date_start" IS NOT NULL AND "intelligence_financing"."date_end" IS NOT NULL AND "intelligence_financing"."date_start" <= "intelligence_financing"."date_end"))
);
--> statement-breakpoint
CREATE TABLE "intelligence_signal_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"material" boolean NOT NULL,
	"reason" varchar(2000) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_signal_revision_number" UNIQUE("firm_id","company_id","signal_id","revision"),
	CONSTRAINT "intelligence_signal_revision_context" UNIQUE("firm_id","company_id","signal_id","id"),
	CONSTRAINT "intelligence_signal_revision_positive" CHECK ("intelligence_signal_revisions"."revision" > 0),
	CONSTRAINT "intelligence_signal_revision_reason" CHECK (length(trim("intelligence_signal_revisions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "intelligence_signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"duplicate_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "intelligence_signal_firm_company_id" UNIQUE("firm_id","company_id","id"),
	CONSTRAINT "intelligence_signal_version_positive" CHECK ("intelligence_signals"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "intelligence_financing" ADD CONSTRAINT "intelligence_financing_revision_fk" FOREIGN KEY ("firm_id","company_id","signal_id","revision_id") REFERENCES "public"."intelligence_signal_revisions"("firm_id","company_id","signal_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_signal_revisions" ADD CONSTRAINT "intelligence_revision_signal_fk" FOREIGN KEY ("firm_id","company_id","signal_id") REFERENCES "public"."intelligence_signals"("firm_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_signals" ADD CONSTRAINT "intelligence_signal_company_fk" FOREIGN KEY ("firm_id","company_id") REFERENCES "public"."intelligence_companies"("firm_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_financing_history" ON "intelligence_financing" USING btree ("firm_id","company_id","currency","round_type","date_start");--> statement-breakpoint
CREATE INDEX "intelligence_signal_timeline" ON "intelligence_signals" USING btree ("firm_id","company_id","created_at","id");