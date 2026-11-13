CREATE TABLE "host_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_block_ends_after_starts" CHECK ("host_block"."ends_at" > "host_block"."starts_at"),
	CONSTRAINT "host_block_note_length" CHECK (char_length("host_block"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "host_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"time_zone" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_hours_weekday_range" CHECK ("host_hours"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "host_hours_minutes_range" CHECK ("host_hours"."start_minute" >= 0 AND "host_hours"."end_minute" <= 1440),
	CONSTRAINT "host_hours_start_before_end" CHECK ("host_hours"."start_minute" < "host_hours"."end_minute"),
	CONSTRAINT "host_hours_time_zone_length" CHECK (char_length(btrim("host_hours"."time_zone")) BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "host_block" ADD CONSTRAINT "host_block_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_hours" ADD CONSTRAINT "host_hours_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_block_member_idx" ON "host_block" USING btree ("member_id","starts_at");--> statement-breakpoint
CREATE INDEX "host_hours_member_idx" ON "host_hours" USING btree ("member_id","weekday");