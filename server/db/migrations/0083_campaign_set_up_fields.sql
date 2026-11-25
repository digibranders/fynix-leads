ALTER TABLE "campaign" ADD COLUMN "pitch_introduction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "pitch_services" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "pitch_differentiator" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "pitch_collaterals" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "pitch_case_studies" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "qualifying_questions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "first_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "second_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "primary_contact_id" uuid;--> statement-breakpoint
-- The unique constraint comes first: the foreign key below points at it.
ALTER TABLE "client_contact" ADD CONSTRAINT "client_contact_id_client_unique" UNIQUE("id","client_org_id");--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_primary_contact_fk" FOREIGN KEY ("primary_contact_id","client_org_id") REFERENCES "public"."client_contact"("id","client_org_id") ON DELETE no action ON UPDATE no action;
