ALTER TABLE "campaign" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ADD COLUMN "side" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "alias_identity" ADD COLUMN "client_org_id" uuid;--> statement-breakpoint
ALTER TABLE "alias_identity" ADD CONSTRAINT "alias_identity_client_org_id_organisation_id_fk" FOREIGN KEY ("client_org_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ADD CONSTRAINT "agreement_acceptance_side_check" CHECK ("agreement_acceptance"."side" IN ('client', 'supplier'));