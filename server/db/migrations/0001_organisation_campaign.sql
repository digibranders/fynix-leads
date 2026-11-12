CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."organisation_kind" AS ENUM('fynix', 'client', 'agency');--> statement-breakpoint
CREATE TYPE "public"."organisation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"kind" "organisation_kind" NOT NULL,
	"name" text NOT NULL,
	"brand_name" text,
	"status" "organisation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "organisation_id_kind_unique" UNIQUE("id","kind"),
	CONSTRAINT "organisation_public_ref_format" CHECK ("organisation"."public_ref" ~ '^ORG-[0-9A-HJKMNP-TV-Z]{4}$'),
	CONSTRAINT "organisation_client_has_brand" CHECK ("organisation"."kind" <> 'client' OR "organisation"."brand_name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"name" text NOT NULL,
	"client_org_id" uuid NOT NULL,
	"client_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"agency_org_id" uuid NOT NULL,
	"agency_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
	"client_brand_name" text DEFAULT '' NOT NULL,
	"internal_notes" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_target" integer NOT NULL,
	"total_target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "campaign_id_orgs_unique" UNIQUE("id","client_org_id","agency_org_id"),
	CONSTRAINT "campaign_public_ref_format" CHECK ("campaign"."public_ref" ~ '^CMP-[0-9A-HJKMNP-TV-Z]{4}$'),
	CONSTRAINT "campaign_dates_in_order" CHECK ("campaign"."end_date" >= "campaign"."start_date"),
	CONSTRAINT "campaign_targets_not_negative" CHECK ("campaign"."monthly_target" >= 0 AND "campaign"."total_target" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_client_org_fk" FOREIGN KEY ("client_org_id","client_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_agency_org_fk" FOREIGN KEY ("agency_org_id","agency_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_client_org_idx" ON "campaign" USING btree ("client_org_id");--> statement-breakpoint
CREATE INDEX "campaign_agency_org_idx" ON "campaign" USING btree ("agency_org_id");