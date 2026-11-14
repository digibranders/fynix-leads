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
  "delivered",
  "disputed",
  "declined",
  "withdrawn",
  "lost",
  "rejected",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

const STAGE_CONFIG: Record<LeadStage, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_client: { label: "Awaiting client", tone: "pending" },
  scheduled: { label: "Scheduled", tone: "approved" },
  outcome_due: { label: "Outcome due", tone: "pending" },
  reschedule_needed: { label: "Reschedule needed", tone: "clarify" },
  held: { label: "Meeting held", tone: "neutral" },
  client_no_show: { label: "Client no-show", tone: "problem" },
  prospect_no_show: { label: "Prospect no-show", tone: "problem" },
  delivered: { label: "Delivered", tone: "approved" },
  disputed: { label: "Disputed", tone: "problem" },
  declined: { label: "Declined", tone: "rejected" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  lost: { label: "Lost", tone: "rejected" },
  rejected: { label: "Rejected", tone: "rejected" },
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
  awaiting_client: ["scheduled", "declined", "withdrawn"],
  scheduled: ["outcome_due", "held", "reschedule_needed", "client_no_show", "prospect_no_show"],
  outcome_due: ["held", "client_no_show", "prospect_no_show", "reschedule_needed"],
  reschedule_needed: ["scheduled", "lost", "withdrawn"],
  held: ["delivered", "lost"],
  client_no_show: ["reschedule_needed", "lost", "delivered"],
  prospect_no_show: ["reschedule_needed", "lost"],
  delivered: ["disputed"],
  disputed: ["rejected", "delivered"],
  declined: [],
  withdrawn: [],
  lost: [],
  rejected: [],
};

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStage(stage: LeadStage): boolean {
  return ["declined", "withdrawn", "lost", "rejected"].includes(stage);
}
