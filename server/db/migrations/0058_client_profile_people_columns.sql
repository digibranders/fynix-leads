CREATE TABLE "client_collateral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_org_id" uuid NOT NULL,
	"client_org_kind" "organisation_kind" DEFAULT 'client' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"file_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "client_collateral_is_client" CHECK ("client_collateral"."client_org_kind" = 'client'),
	CONSTRAINT "client_collateral_kind" CHECK ("client_collateral"."kind" IN ('file', 'link')),
	CONSTRAINT "client_collateral_target" CHECK (("client_collateral"."kind" = 'link' AND "client_collateral"."url" IS NOT NULL AND "client_collateral"."file_ref" IS NULL) OR ("client_collateral"."kind" = 'file' AND "client_collateral"."file_ref" IS NOT NULL AND "client_collateral"."url" IS NULL)),
	CONSTRAINT "client_collateral_title_length" CHECK (char_length(btrim("client_collateral"."title")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE "client_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_org_id" uuid NOT NULL,
	"client_org_kind" "organisation_kind" DEFAULT 'client' NOT NULL,
	"introduction" text DEFAULT '' NOT NULL,
	"services" text DEFAULT '' NOT NULL,
	"differentiator" text DEFAULT '' NOT NULL,
	"case_studies" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profile_client_unique" UNIQUE("client_org_id"),
	CONSTRAINT "client_profile_is_client" CHECK ("client_profile"."client_org_kind" = 'client')
);
--> statement-breakpoint
ALTER TABLE "invite" DROP CONSTRAINT "invite_not_fynix";--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "client_collateral" ADD CONSTRAINT "client_collateral_org_fk" FOREIGN KEY ("client_org_id","client_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_org_fk" FOREIGN KEY ("client_org_id","client_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_collateral_client_idx" ON "client_collateral" USING btree ("client_org_id");