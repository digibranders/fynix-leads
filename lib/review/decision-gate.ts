export type DecisionGate = {
  /** True when a decision may go ahead now. Allowing one starts the lock. */
  allow: () => boolean;
  /** Starts the lock without a decision, for example when another lead is selected. */
  touch: () => void;
};

/**
 * Refuses a second decision shortly after the previous one or after the selection changed.
 * After a decision the panel shows the next lead, so a fast double click would otherwise decide a lead nobody looked at.
 */
export function createDecisionGate(lockMs = 400, clock: () => number = Date.now): DecisionGate {
  let lockedAt = Number.NEGATIVE_INFINITY;
  return {
    allow() {
      const now = clock();
      if (now - lockedAt < lockMs) return false;
      lockedAt = now;
      return true;
    },
    touch() {
      lockedAt = clock();
    },
  };
}
