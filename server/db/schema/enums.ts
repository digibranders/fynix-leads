import { pgEnum } from "drizzle-orm/pg-core";

export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed", "archived"]);
export const memberRole = pgEnum("member_role", ["member", "manager"]);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
/** The first three are the account emails. The rest are the launch emails of phase 6 (lib/email/launch-templates.ts): prospect letters end in prospect_*, the others go to people of the portal. */
export const emailTemplate = pgEnum("email_template", [
  "password_reset",
  "invite",
  "alias_code",
  "lead_waiting",
  "lead_submitted_info",
  "times_proposed_info",
  "meeting_booked",
  "meeting_moved",
  "meeting_cancelled",
  "outcome_nudge",
  "outcome_held_client",
  "outcome_held_info",
  "decision_reminder",
  "lead_accepted_info",
  "lead_rejected_info",
  "lead_auto_accepted_info",
  "rejection_overturned_info",
  "no_show_info",
  "prospect_confirmed",
  "prospect_moved",
  "prospect_cancelled",
  "prospect_reminder_24h",
  "prospect_reminder_1h",
  "lead_auto_accepted_client",
  "rejection_overturned_client",
  "client_no_show_client",
  "postponement_proposed_info",
  "outcome_contested_info",
  "contest_decided_info",
  "review_requested_info",
]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed", "cancelled"]);
export const termsStatus = pgEnum("terms_status", ["current", "superseded"]);
/** Which side of a campaign an agreement is with: Fynix and the client, or Fynix and the coordinator (spec 7.2). Since phase 2 only `client` rows are made; `coordinator` stays in the enum for the old rows, which are kept and never read. */
export const agreementParty = pgEnum("agreement_party", ["client", "supplier"]);
export const agreementStatus = pgEnum("agreement_status", ["current", "superseded"]);

