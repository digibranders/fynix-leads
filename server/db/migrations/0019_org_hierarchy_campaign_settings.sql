ALTER TABLE "organisation" ADD COLUMN "parent_org_id" uuid;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "parent_org_kind" "organisation_kind" GENERATED ALWAYS AS (CASE WHEN parent_org_id IS NULL THEN NULL ELSE 'agency'::organisation_kind END) STORED;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "time_zone" text DEFAULT 'Europe/London' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "meeting_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_fk" FOREIGN KEY ("parent_org_id","parent_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisation_parent_idx" ON "organisation" USING btree ("parent_org_id");--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_not_self" CHECK ("organisation"."parent_org_id" IS NULL OR "organisation"."parent_org_id" <> "organisation"."id");--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_only_agency" CHECK ("organisation"."parent_org_id" IS NULL OR "organisation"."kind" = 'agency');--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_meeting_minutes_range" CHECK ("campaign"."meeting_minutes" BETWEEN 15 AND 240);--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_time_zone_length" CHECK (char_length(btrim("campaign"."time_zone")) BETWEEN 1 AND 64);