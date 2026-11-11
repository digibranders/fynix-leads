export const APPROVAL_STATUSES = ["draft", "pending", "approved", "rejected", "needs_clarification"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const MEETING_STATUSES = [
  "proposed",
  "scheduled",
  "rescheduled",
  "completed",
  "prospect_no_show",
  "client_no_show",
  "prospect_declined",
  "cancelled",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export type StatusTone = "neutral" | "pending" | "approved" | "rejected" | "clarify" | "problem";

const APPROVAL: Record<ApprovalStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending: { label: "Pending review", tone: "pending" },
  approved: { label: "Approved", tone: "approved" },
  rejected: { label: "Rejected", tone: "rejected" },
  needs_clarification: { label: "Needs clarification", tone: "clarify" },
};

const MEETING: Record<MeetingStatus, { label: string; tone: StatusTone }> = {
  proposed: { label: "Time proposed", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "neutral" },
  rescheduled: { label: "Rescheduled", tone: "neutral" },
  completed: { label: "Completed", tone: "neutral" },
  prospect_no_show: { label: "Prospect no-show", tone: "problem" },
  client_no_show: { label: "Client no-show", tone: "problem" },
  prospect_declined: { label: "Prospect declined", tone: "problem" },
  cancelled: { label: "Cancelled", tone: "problem" },
};

export const approvalLabel = (s: ApprovalStatus): string => APPROVAL[s].label;
export const approvalTone = (s: ApprovalStatus): StatusTone => APPROVAL[s].tone;
export const meetingLabel = (s: MeetingStatus): string => MEETING[s].label;
export const meetingTone = (s: MeetingStatus): StatusTone => MEETING[s].tone;
