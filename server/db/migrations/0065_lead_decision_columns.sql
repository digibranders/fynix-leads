CREATE TABLE "lead_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_reminder_lead_kind_unique" UNIQUE("lead_id","kind"),
	CONSTRAINT "lead_reminder_kind_check" CHECK ("lead_reminder"."kind" IN ('12h', '24h', '36h'))
);
--> statement-breakpoint
ALTER TABLE "lead" DROP CONSTRAINT "lead_stage_check";--> statement-breakpoint
ALTER TABLE "lead_history" DROP CONSTRAINT "lead_history_role_check";--> statement-breakpoint
ALTER TABLE "lead_history" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "outcome_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "decision_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "decision_source" text;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "recorded_by_role" text;--> statement-breakpoint
ALTER TABLE "lead_reminder" ADD CONSTRAINT "lead_reminder_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_decision_by_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_decision_source_check" CHECK ("lead"."decision_source" IS NULL OR "lead"."decision_source" IN ('client', 'auto', 'fynix'));--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_decision_note_length" CHECK ("lead"."decision_note" IS NULL OR char_length(btrim("lead"."decision_note")) BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_stage_check" CHECK ("lead"."stage" IN ('draft', 'awaiting_client', 'scheduled', 'outcome_due', 'reschedule_needed', 'held', 'client_no_show', 'prospect_no_show', 'awaiting_decision', 'accepted', 'delivered', 'disputed', 'declined', 'withdrawn', 'lost', 'rejected'));--> statement-breakpoint
ALTER TABLE "lead_history" ADD CONSTRAINT "lead_history_role_check" CHECK ("lead_history"."actor_role" IN ('client', 'agency', 'fynix', 'system'));--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_recorded_by_role_check" CHECK ("meeting"."recorded_by_role" IS NULL OR "meeting"."recorded_by_role" IN ('client', 'agency', 'coordinator', 'fynix'));