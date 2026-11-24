/** The side a person reads a lead from. The coordinator and the agencies share one: the supply side. */
export type LeadViewer = "client" | "supply" | "fynix";

export type LeadAction = "pick_time" | "propose_times" | "reject" | "record_outcome" | "decide" | "overturn";

/**
 * The actions that are valid for a lead, by who is looking and where the lead stands. The domain repeats every rule; this only decides which
 * buttons to show, so nobody is offered a button that will be refused.
 * - Before a time is booked (`awaiting_client`) only the client acts: pick a time, ask for other times, or reject with a note.
 * - Once booked, the client may still reject; after the meeting time every side may record how it went.
 * - After "held" the client accepts or rejects. After a rejection Fynix may overturn it.
 * `meetingPassed` is whether the booked time has gone: a scheduled lead past its time is as good as `outcome_due`.
 */
export function availableActions(input: { readonly viewer: LeadViewer; readonly stage: string; readonly meetingPassed: boolean }): readonly LeadAction[] {
  const { viewer, stage, meetingPassed } = input;
  const awaitingOutcome = stage === "outcome_due" || (stage === "scheduled" && meetingPassed);
  const actions: LeadAction[] = [];
  if (viewer === "client") {
    if (stage === "awaiting_client") actions.push("pick_time", "propose_times", "reject");
    if (stage === "scheduled") actions.push("reject");
    if (awaitingOutcome) actions.push("record_outcome");
    if (stage === "awaiting_decision") actions.push("decide");
    return actions;
  }
  if (awaitingOutcome) actions.push("record_outcome");
  if (viewer === "fynix" && stage === "rejected") actions.push("overturn");
  return actions;
}
