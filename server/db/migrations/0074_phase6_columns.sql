CREATE TABLE "meeting_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_reminder_meeting_kind_unique" UNIQUE("meeting_id","kind"),
	CONSTRAINT "meeting_reminder_kind_check" CHECK ("meeting_reminder"."kind" IN ('prospect_24h', 'prospect_1h', 'nudge_end', 'nudge_24h'))
);
--> statement-breakpoint
CREATE TABLE "meeting_join" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_join_name_length" CHECK (char_length(btrim("meeting_join"."display_name")) BETWEEN 1 AND 120),
	CONSTRAINT "meeting_join_duration_not_negative" CHECK ("meeting_join"."duration_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "client_privacy_url" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "prospect_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "reply_to" text;--> statement-breakpoint
ALTER TABLE "lead_reminder" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "google_space_id" text;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "ics_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "join_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_reminder" ADD CONSTRAINT "meeting_reminder_meeting_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_join" ADD CONSTRAINT "meeting_join_meeting_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_join_meeting_idx" ON "meeting_join" USING btree ("meeting_id","joined_at");--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_privacy_url_https" CHECK ("campaign"."client_privacy_url" IS NULL OR ("campaign"."client_privacy_url" ~ '^https://[^[:space:]]+$' AND char_length("campaign"."client_privacy_url") <= 500));--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_prospect_email_needs_privacy_url" CHECK (NOT "campaign"."prospect_email_enabled" OR "campaign"."client_privacy_url" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_ics_sequence_not_negative" CHECK ("meeting"."ics_sequence" >= 0);