ALTER TABLE "pipeline_deals" ALTER COLUMN "name" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "pipeline_deals" ALTER COLUMN "company_name" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "pipeline_firms" ADD COLUMN "research_firm_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_firms" ADD CONSTRAINT "pipeline_firms_research_firm_id_research_firms_id_fk" FOREIGN KEY ("research_firm_id") REFERENCES "public"."research_firms"("id") ON DELETE no action ON UPDATE no action;