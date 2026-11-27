// No imports: the database schema (loaded by drizzle-kit, which does not know the @/ alias) lists these in a check constraint.

/** Every kind a notice can have: the check constraint on `notification.kind` lists exactly these. The first seven are from migration 0036. */
export const NOTICE_KINDS = [
  "lead_submitted",
  "lead_reviewed",
  "meeting_scheduled",
  "outcome_recorded",
  "dispute_raised",
  "message_received",
  "general",
  "times_proposed",
  "meeting_postponed",
  "lead_rejected",
  "lead_withdrawn",
  "lead_lost",
  "decision_needed",
  "decision_reminder",
  "lead_accepted",
  "lead_auto_accepted",
  "outcome_contested",
  "contest_decided",
  "rejection_overturned",
  "review_requested",
  "agreement_published",
  "campaign_active",
  "campaign_closed",
  "campaign_assigned",
  "campaign_shared",
  "campaign_unshared",
  "agreement_accepted",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
