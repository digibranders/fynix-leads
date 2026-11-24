/** How long the client has to answer after the outcome "meeting finished" is recorded. After it the lead is accepted. */
export const AUTO_ACCEPT_HOURS = 48;

const HOUR = 3_600_000;

export interface AutoAcceptCountdown {
  /** Whole hours left, rounded up, never below zero. */
  readonly hoursLeft: number;
  readonly label: string;
  /** Less than a day left: the row reads as urgent. */
  readonly urgent: boolean;
}

/** When a lead waiting for the client's answer is accepted on its own. */
export function autoAcceptAt(outcomeRecordedAt: Date): Date {
  return new Date(outcomeRecordedAt.getTime() + AUTO_ACCEPT_HOURS * HOUR);
}

/** The line under a lead in the decision queue: "Accepted automatically in 31h". */
export function autoAcceptCountdown(outcomeRecordedAt: Date, now: Date): AutoAcceptCountdown {
  const msLeft = autoAcceptAt(outcomeRecordedAt).getTime() - now.getTime();
  if (msLeft <= 0) return { hoursLeft: 0, label: "Accepted automatically at the next check", urgent: true };
  const hoursLeft = Math.ceil(msLeft / HOUR);
  return { hoursLeft, label: `Accepted automatically in ${hoursLeft}h`, urgent: hoursLeft <= 24 };
}

/** What the client still has to answer: leads waiting for a time and leads waiting for accept or reject. */
export function clientQueueCount(leads: readonly { readonly stage: string }[]): number {
  return leads.filter((lead) => lead.stage === "awaiting_client" || lead.stage === "awaiting_decision").length;
}
