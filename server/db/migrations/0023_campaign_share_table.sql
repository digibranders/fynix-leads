CREATE TABLE "campaign_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"agency_org_id" uuid NOT NULL,
	"agency_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
	"monthly_share" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_share_campaign_agency_unique" UNIQUE("campaign_id","agency_org_id"),
	CONSTRAINT "campaign_share_not_negative" CHECK ("campaign_share"."monthly_share" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_share" ADD CONSTRAINT "campaign_share_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_share" ADD CONSTRAINT "campaign_share_agency_fk" FOREIGN KEY ("agency_org_id","agency_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_share_agency_idx" ON "campaign_share" USING btree ("agency_org_id");