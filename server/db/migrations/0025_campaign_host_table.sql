CREATE TABLE "campaign_host" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"client_org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"job_title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_host_campaign_member_unique" UNIQUE("campaign_id","member_id"),
	CONSTRAINT "campaign_host_job_title_length" CHECK (char_length(btrim("campaign_host"."job_title")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_id_client_unique" UNIQUE("id","client_org_id");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_id_org_unique" UNIQUE("id","org_id");--> statement-breakpoint
ALTER TABLE "campaign_host" ADD CONSTRAINT "campaign_host_campaign_fk" FOREIGN KEY ("campaign_id","client_org_id") REFERENCES "public"."campaign"("id","client_org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_host" ADD CONSTRAINT "campaign_host_member_fk" FOREIGN KEY ("member_id","client_org_id") REFERENCES "public"."member"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_host_member_idx" ON "campaign_host" USING btree ("member_id");--> statement-breakpoint