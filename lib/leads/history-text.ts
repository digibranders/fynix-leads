import { leadStageLabel, type LeadStage } from "./stage";

/** What a history row says in plain words. The note, if any, is shown beside it. An action this list does not know reads as "Updated". */
const ACTION_TEXT: Readonly<Record<string, string>> = {
  "lead.submit": "Lead submitted",
  "lead.accept": "Meeting time booked",
  "lead.propose_times": "Other times proposed",
  "lead.decline": "Rejected before the meeting",
  "lead.decide_accept": "Accepted",
  "lead.decide_reject": "Rejected",
  "lead.auto_accept": "Accepted automatically",
  "lead.overturn_rejection": "Rejection changed to accepted",
  "lead.record_outcome": "Meeting outcome recorded",
  "meeting.outcome": "Meeting outcome recorded",
  "lead.discard_draft": "Draft discarded",
  "lead.withdraw": "Withdrawn before the meeting",
  "meeting.postpone_propose": "New meeting times proposed",
  "meeting.postpone_pick": "Meeting moved to a new time",
  "meeting.contest": "Outcome contested",
  "meeting.contest_decided": "Contest decided by Fynix",
  "lead.rejection_reviewed": "Rejection reviewed by Fynix",
  "lead.correct": "Lead corrected by Fynix",
  "lead.answer_for_client": "Answered by Fynix for the client",
  "lead.mark_lost": "Marked lost by Fynix",
  "lead.approve_over_share": "Beyond a share, approved by Fynix",
  "lead.dispute": "Disputed",
  "lead.resolve_dispute": "Dispute decided",
};

export function historyActionText(action: string): string {
  return ACTION_TEXT[action] ?? "Updated";
}

/** Who did it, as the viewer may read it. The client never sees "coordinator" or "agency": it reads the supply side as "Fynix team". */
export function historySideText(by: "client" | "supply" | "fynix" | "system", viewer: "client" | "supply" | "fynix"): string {
  if (by === "client") return viewer === "client" ? "Your team" : "Client";
  if (by === "fynix") return "Fynix";
  if (by === "system") return "Automatic";
  return viewer === "client" ? "Fynix team" : viewer === "supply" ? "Coordinator or agency" : "Coordinator or agency";
}

/** "Scheduled to Meeting held", or null when the stage did not change. An unknown stage reads as its raw name. */
export function stageChangeText(from: string | null, to: string | null): string | null {
  if (to === null || from === to) return null;
  const label = (stage: string) => leadStageLabel(stage as LeadStage);
  return from === null ? label(to) : `${label(from)} to ${label(to)}`;
}

/**
 * The label over the note of a decision. The supply side reads the client's note as from "Client", never a person; the client and Fynix may read
 * the person's name. An automatic acceptance and a Fynix change say so.
 */
export function decisionNoteLabel(viewer: "client" | "supply" | "fynix", source: "client" | "auto" | "fynix", byName: string | null): string {
  if (source === "auto") return "Automatic acceptance";
  if (source === "fynix") return viewer === "fynix" && byName !== null ? `Fynix note, ${byName}` : "Fynix note";
  if (viewer === "supply") return "Client's note";
  if (viewer === "client") return byName === null ? "Your team's note" : `Note from ${byName}`;
  return byName === null ? "Client's note" : `Client's note, ${byName}`;
}
