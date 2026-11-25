CREATE TABLE "client_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_org_id" uuid NOT NULL,
	"client_org_kind" "organisation_kind" DEFAULT 'client' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "client_contact_is_client" CHECK ("client_contact"."client_org_kind" = 'client'),
	CONSTRAINT "client_contact_name_length" CHECK (char_length(btrim("client_contact"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "client_contact_email_length" CHECK ("client_contact"."email" IS NULL OR char_length("client_contact"."email") BETWEEN 3 AND 254),
	CONSTRAINT "client_contact_phone_length" CHECK ("client_contact"."phone" IS NULL OR char_length("client_contact"."phone") BETWEEN 3 AND 40),
	CONSTRAINT "client_contact_job_title_length" CHECK ("client_contact"."job_title" IS NULL OR char_length(btrim("client_contact"."job_title")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "client_contact" ADD CONSTRAINT "client_contact_org_fk" FOREIGN KEY ("client_org_id","client_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contact_client_idx" ON "client_contact" USING btree ("client_org_id");