/** Hours the other side has to contest a recorded outcome, and the coordinator has to ask for a review of a rejection. The domain repeats both. */
export const CONTEST_WINDOW_HOURS = 48;
export const REVIEW_WINDOW_HOURS = 48;

const HOUR = 3_600_000;

export interface WindowLeft {
  readonly open: boolean;
  /** Whole hours left, rounded up, never below zero. */
  readonly hoursLeft: number;
  readonly label: string;
}

/** The time left of a window that started at `startedAt`: "36h left", or that it has closed. */
export function windowLeft(startedAt: Date, hours: number, now: Date): WindowLeft {
  const msLeft = startedAt.getTime() + hours * HOUR - now.getTime();
  if (msLeft <= 0) return { open: false, hoursLeft: 0, label: "The 48 hours are over" };
  const hoursLeft = Math.ceil(msLeft / HOUR);
  return { open: true, hoursLeft, label: `${hoursLeft}h left` };
}

/** The stage a lead holds while a recorded outcome stands: the only stages from which it can be contested. */
const STAGE_OF_OUTCOME: Readonly<Record<string, string>> = { held: "awaiting_decision", client_no_show: "client_no_show", prospect_no_show: "prospect_no_show" };

/**
 * Whether the viewer may contest the outcome now, and how long is left. Mirrors `contestOutcome`: the other side of the one that recorded it, never
 * Fynix's, once, inside 48 hours, while the lead still stands where the outcome left it.
 */
export function contestWindow(input: {
  readonly viewer: "client" | "supply" | "fynix";
  readonly stage: string;
  readonly outcome: string | null;
  readonly recordedAt: Date | null;
  readonly recordedByRole: string | null;
  readonly contestedAt: Date | null;
  readonly now: Date;
}): WindowLeft & { readonly canContest: boolean } {
  const { viewer, stage, outcome, recordedAt, recordedByRole, contestedAt, now } = input;
  const eligible =
    viewer !== "fynix" &&
    outcome !== null &&
    recordedAt !== null &&
    recordedByRole !== null &&
    recordedByRole !== "fynix" &&
    (recordedByRole === "client") !== (viewer === "client") &&
    contestedAt === null &&
    STAGE_OF_OUTCOME[outcome] === stage;
  if (!eligible || recordedAt === null) return { open: false, hoursLeft: 0, label: "", canContest: false };
  const left = windowLeft(recordedAt, CONTEST_WINDOW_HOURS, now);
  return { ...left, canContest: left.open };
}

/** Whether the coordinator may ask for a review of a rejection now, and how long is left. Mirrors `requestRejectionReview`. */
export function reviewWindow(input: {
  readonly stage: string;
  readonly decisionSource: string | null;
  readonly decisionAt: Date | null;
  readonly alreadyAsked: boolean;
  readonly now: Date;
}): WindowLeft & { readonly canAsk: boolean } {
  const { stage, decisionSource, decisionAt, alreadyAsked, now } = input;
  if (stage !== "rejected" || decisionSource !== "client" || decisionAt === null || alreadyAsked) return { open: false, hoursLeft: 0, label: "", canAsk: false };
  const left = windowLeft(decisionAt, REVIEW_WINDOW_HOURS, now);
  return { ...left, canAsk: left.open };
}
