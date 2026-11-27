CREATE TABLE "calendar_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"provider" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"failed_syncs" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connection_member_provider_unique" UNIQUE("member_id","provider"),
	CONSTRAINT "calendar_connection_provider_check" CHECK ("calendar_connection"."provider" IN ('google', 'microsoft')),
	CONSTRAINT "calendar_connection_status_check" CHECK ("calendar_connection"."status" IN ('connected', 'broken')),
	CONSTRAINT "calendar_connection_failed_syncs_check" CHECK ("calendar_connection"."failed_syncs" >= 0)
);
--> statement-breakpoint
CREATE TABLE "member_busy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "member_busy_order_check" CHECK ("member_busy"."starts_at" < "member_busy"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_busy" ADD CONSTRAINT "member_busy_connection_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_busy_member_idx" ON "member_busy" USING btree ("member_id","starts_at");