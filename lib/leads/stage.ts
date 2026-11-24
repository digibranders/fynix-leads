import type { StatusTone } from "@/lib/domain/status";

export const LEAD_STAGES = [
  "draft",
  "awaiting_client",
  "scheduled",
  "outcome_due",
  "reschedule_needed",
  "held",
  "client_no_show",
  "prospect_no_show",
  "awaiting_decision",
  "accepted",
  "delivered",
  "disputed",
  "declined",
  "withdrawn",
  "lost",
  "rejected",
  "outcome_contested",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

const STAGE_CONFIG: Record<LeadStage, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_client: { label: "Awaiting client", tone: "pending" },
  scheduled: { label: "Scheduled", tone: "approved" },
  outcome_due: { label: "Outcome due", tone: "pending" },
  reschedule_needed: { label: "Reschedule needed", tone: "clarify" },
  held: { label: "Meeting held", tone: "neutral" },
  awaiting_decision: { label: "Awaiting decision", tone: "pending" },
  accepted: { label: "Accepted", tone: "approved" },
  client_no_show: { label: "Client no-show", tone: "problem" },
  prospect_no_show: { label: "Prospect no-show", tone: "problem" },
  // `delivered` is the old name for a counted lead; rows written before the client decided after the meeting still carry it.
  delivered: { label: "Accepted", tone: "approved" },
  disputed: { label: "Disputed", tone: "problem" },
  declined: { label: "Rejected before the meeting", tone: "rejected" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  lost: { label: "Lost", tone: "rejected" },
  rejected: { label: "Rejected", tone: "rejected" },
  outcome_contested: { label: "Outcome contested", tone: "clarify" },
};

export function leadStageLabel(stage: LeadStage): string {
  return STAGE_CONFIG[stage]?.label ?? stage;
}

export function leadStageTone(stage: LeadStage): StatusTone {
  return STAGE_CONFIG[stage]?.tone ?? "neutral";
}

/** Allowed stage transitions for lead lifecycle. */
const ALLOWED_TRANSITIONS: Record<LeadStage, readonly LeadStage[]> = {
  draft: ["awaiting_client", "withdrawn"],
  awaiting_client: ["scheduled", "declined", "withdrawn", "lost"],
  // A booked meeting is moved by postponing and stays `scheduled`; the source organisation can withdraw the lead before it is held.
  scheduled: ["outcome_due", "awaiting_decision", "declined", "held", "reschedule_needed", "client_no_show", "prospect_no_show", "withdrawn", "lost"],
  outcome_due: ["awaiting_decision", "held", "client_no_show", "prospect_no_show", "reschedule_needed"],
  // The other side contests a recorded outcome; Fynix decides it, and the lead carries on from the outcome it names.
  awaiting_decision: ["accepted", "rejected", "outcome_contested", "lost"],
  outcome_contested: ["awaiting_decision", "client_no_show", "prospect_no_show", "lost"],
  accepted: [],
  reschedule_needed: ["scheduled", "lost", "withdrawn"],
  held: ["delivered", "lost"],
  client_no_show: ["reschedule_needed", "lost", "delivered", "outcome_contested"],
  prospect_no_show: ["reschedule_needed", "lost", "outcome_contested"],
  delivered: ["disputed"],
  disputed: ["rejected", "delivered"],
  declined: [],
  withdrawn: [],
  lost: [],
  // Fynix can overturn a rejection (lead flow decision, "Challenge").
  rejected: ["accepted"],
};

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStage(stage: LeadStage): boolean {
  return ["declined", "withdrawn", "lost", "rejected", "accepted", "prospect_no_show"].includes(stage);
}
