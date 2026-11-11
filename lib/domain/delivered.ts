import type { ApprovalStatus, MeetingStatus } from "./status";

/** Spec section 7: a lead is delivered when the client approved it and one of its meetings completed. */
export function isDelivered(lead: {
  approval: ApprovalStatus;
  meetings: readonly { status: MeetingStatus }[];
}): boolean {
  return lead.approval === "approved" && lead.meetings.some((m) => m.status === "completed");
}
