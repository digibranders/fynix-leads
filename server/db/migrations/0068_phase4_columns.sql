CREATE TABLE "meeting_reschedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"proposed_by_side" text NOT NULL,
	"proposed_by_user_id" uuid NOT NULL,
	"proposed_times" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"picked_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "meeting_reschedule_side_check" CHECK ("meeting_reschedule"."proposed_by_side" IN ('client', 'supply')),
	CONSTRAINT "meeting_reschedule_status_check" CHECK ("meeting_reschedule"."status" IN ('open', 'accepted', 'superseded')),
	CONSTRAINT "meeting_reschedule_times_check" CHECK (jsonb_typeof("meeting_reschedule"."proposed_times") = 'array' AND jsonb_array_length("meeting_reschedule"."proposed_times") BETWEEN 1 AND 3),
	CONSTRAINT "meeting_reschedule_resolved_check" CHECK (("meeting_reschedule"."status" = 'open' AND "meeting_reschedule"."resolved_at" IS NULL AND "meeting_reschedule"."picked_time" IS NULL) OR ("meeting_reschedule"."status" <> 'open' AND "meeting_reschedule"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rejection_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "rejection_review_lead_unique" UNIQUE("lead_id"),
	CONSTRAINT "rejection_review_status_check" CHECK ("rejection_review"."status" IN ('open', 'resolved')),
	CONSTRAINT "rejection_review_note_length" CHECK (char_length(btrim("rejection_review"."note")) BETWEEN 5 AND 1000),
	CONSTRAINT "rejection_review_resolved_check" CHECK (("rejection_review"."status" = 'open' AND "rejection_review"."resolved_at" IS NULL) OR ("rejection_review"."status" = 'resolved' AND "rejection_review"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_stage_check";--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_prospect_title_length";--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_prospect_company_length";--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_prospect_domain_length";--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_prospect_email_check";--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "alias_identity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "host_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "released" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "rejection_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "contested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "contest_note" text;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "contested_by_role" text;--> statement-breakpoint
ALTER TABLE "meeting_reschedule" ADD CONSTRAINT "meeting_reschedule_meeting_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reschedule" ADD CONSTRAINT "meeting_reschedule_user_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejection_review" ADD CONSTRAINT "rejection_review_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejection_review" ADD CONSTRAINT "rejection_review_user_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_reschedule_meeting_idx" ON "meeting_reschedule" USING btree ("meeting_id","created_at");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_draft_complete" CHECK ("lead"."stage" = 'draft' OR NOT "lead"."released" OR ("lead"."alias_identity_id" IS NOT NULL AND "lead"."host_member_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_draft_not_released" CHECK ("lead"."stage" <> 'draft' OR NOT "lead"."released");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_stage_check" CHECK ("lead"."stage" IN ('draft', 'awaiting_client', 'scheduled', 'outcome_due', 'reschedule_needed', 'held', 'client_no_show', 'prospect_no_show', 'awaiting_decision', 'accepted', 'delivered', 'disputed', 'declined', 'withdrawn', 'lost', 'rejected', 'outcome_contested'));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_prospect_title_length" CHECK ((NOT "lead"."released" AND "lead"."prospect_title" = '') OR (char_length(btrim("lead"."prospect_title")) BETWEEN 1 AND 120 AND "lead"."prospect_title" = btrim("lead"."prospect_title")));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_prospect_company_length" CHECK ((NOT "lead"."released" AND "lead"."prospect_company" = '') OR (char_length(btrim("lead"."prospect_company")) BETWEEN 1 AND 120 AND "lead"."prospect_company" = btrim("lead"."prospect_company")));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_prospect_domain_length" CHECK ((NOT "lead"."released" AND "lead"."prospect_domain" = '') OR (char_length(btrim("lead"."prospect_domain")) BETWEEN 1 AND 255 AND "lead"."prospect_domain" = lower(btrim("lead"."prospect_domain"))));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_prospect_email_check" CHECK ((NOT "lead"."released" AND "lead"."prospect_email" = '') OR ("lead"."prospect_email" = lower(btrim("lead"."prospect_email")) AND "lead"."prospect_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_contested_by_role_check" CHECK ("meeting"."contested_by_role" IS NULL OR "meeting"."contested_by_role" IN ('client', 'agency', 'coordinator'));--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_contest_note_length" CHECK ("meeting"."contest_note" IS NULL OR char_length(btrim("meeting"."contest_note")) BETWEEN 1 AND 1000);