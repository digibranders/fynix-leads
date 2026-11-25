ALTER TABLE "organisation" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_contact_name_length" CHECK ("organisation"."contact_name" IS NULL OR char_length("organisation"."contact_name") BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_contact_email_length" CHECK ("organisation"."contact_email" IS NULL OR char_length("organisation"."contact_email") BETWEEN 3 AND 254);--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_contact_phone_length" CHECK ("organisation"."contact_phone" IS NULL OR char_length("organisation"."contact_phone") BETWEEN 3 AND 40);--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_website_https" CHECK ("organisation"."website" IS NULL OR ("organisation"."website" ~ '^https://' AND char_length("organisation"."website") <= 2000));--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_address_length" CHECK ("organisation"."address" IS NULL OR char_length("organisation"."address") BETWEEN 1 AND 500);--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_notes_length" CHECK ("organisation"."notes" IS NULL OR char_length("organisation"."notes") BETWEEN 1 AND 4000);