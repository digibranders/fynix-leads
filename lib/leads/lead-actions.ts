/** The side a person reads a lead from. The coordinator and the agencies share one: the supply side. */
export type LeadViewer = "client" | "supply" | "fynix";

export type LeadAction =
  | "pick_time"
  | "propose_times"
  | "reject"
  | "record_outcome"
  | "decide"
  | "overturn"
  // Phase 4: the source withdraws, either side moves a booked meeting, the other side contests an outcome, the coordinator asks for a review.
  | "withdraw"
  | "postpone"
  | "pick_new_time"
  | "contest"
  | "ask_review"
  // Phase 4: Fynix steps in.
  | "decide_contest"
  | "mark_reviewed"
  | "correct"
  | "answer_for_client"
  | "mark_lost"
  | "clear_over_share";

/** Facts the record knows and the stage alone does not. Each one is already worked out by a pure helper or a read; this only gates buttons on them. */
export interface LeadActionFacts {
  /** The viewer's organisation sent the lead (a coordinator reading a partner agency's lead is not the source). */
  readonly isSource?: boolean;
  /** The viewer is the coordinator, not a partner agency. */
  readonly isCoordinator?: boolean;
  /** Which side has an open proposal to move the booked meeting. */
  readonly openProposalBy?: "client" | "supply" | null;
  /** `contestWindow(...).canContest` */
  readonly canContest?: boolean;
  /** `reviewWindow(...).canAsk` */
  readonly canAskReview?: boolean;
  /** Fynix has already looked at this rejection. */
  readonly reviewed?: boolean;
  readonly overShare?: boolean;
}

/** Stages from which Fynix can mark a lead lost (the domain's list). */
const LOSABLE: readonly string[] = ["awaiting_client", "scheduled", "outcome_due", "reschedule_needed", "held", "awaiting_decision", "outcome_contested"];

/**
 * The actions that are valid for a lead, by who is looking and where the lead stands. The domain repeats every rule; this only decides which
 * buttons to show, so nobody is offered a button that will be refused.
 * - Before a time is booked (`awaiting_client`) only the client acts: pick a time, ask for other times, or reject with a note. The source may withdraw.
 * - Once booked, the client may still reject, and either side may propose new times (the other picks one) until the meeting time; the source may withdraw.
 * - After the meeting time every side may record how it went; the other side of a recording may contest it for 48 hours.
 * - After "held" the client accepts or rejects. After a rejection Fynix may overturn it or mark it reviewed, and the coordinator may ask for a review.
 * - Fynix may also correct a lead, answer for the client, mark it lost, decide a contest and clear a beyond-a-share flag.
 * `meetingPassed` is whether the booked time has gone: a scheduled lead past its time is as good as `outcome_due`.
 */
export function availableActions(input: { readonly viewer: LeadViewer; readonly stage: string; readonly meetingPassed: boolean } & LeadActionFacts): readonly LeadAction[] {
  const { viewer, stage, meetingPassed } = input;
  const awaitingOutcome = stage === "outcome_due" || (stage === "scheduled" && meetingPassed);
  const booked = stage === "scheduled";
  const actions: LeadAction[] = [];

  if (viewer === "fynix") {
    if (awaitingOutcome) actions.push("record_outcome");
    if (stage === "rejected") {
      actions.push("overturn");
      if (input.reviewed !== true) actions.push("mark_reviewed");
    }
    if (stage === "outcome_contested") actions.push("decide_contest");
    if (stage === "awaiting_client" || booked || stage === "awaiting_decision") actions.push("answer_for_client");
    if (stage !== "draft") actions.push("correct");
    if (LOSABLE.includes(stage)) actions.push("mark_lost");
    if (input.overShare === true && stage !== "draft") actions.push("clear_over_share");
    return actions;
  }

  const side = viewer === "client" ? "client" : "supply";
  if (viewer === "client") {
    if (stage === "awaiting_client") actions.push("pick_time", "propose_times", "reject");
    if (booked) actions.push("reject");
    if (awaitingOutcome) actions.push("record_outcome");
    if (stage === "awaiting_decision") actions.push("decide");
  } else if (awaitingOutcome) {
    actions.push("record_outcome");
  }
  if (booked && !meetingPassed) actions.push("postpone");
  if (booked && input.openProposalBy != null && input.openProposalBy !== side) actions.push("pick_new_time");
  if (viewer === "supply" && input.isSource === true && (stage === "awaiting_client" || (booked && !meetingPassed))) actions.push("withdraw");
  if (input.canContest === true) actions.push("contest");
  if (viewer === "supply" && input.isCoordinator === true && input.canAskReview === true && stage === "rejected") actions.push("ask_review");
  return actions;
}
