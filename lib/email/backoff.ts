/**
 * How the outbox retries (server/mail/outbox.ts). A message is tried at most five times. After a failed attempt it waits
 * before the next one, so an outage at the provider is not hammered. A message that is still failing after the last
 * attempt is marked `failed` and left for a person to look at.
 */
export const MAX_SEND_ATTEMPTS = 5;

/** Seconds to wait after the 1st, 2nd, 3rd and 4th failed attempt. */
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60] as const;

/**
 * A claimed message is not offered to another runner for this long. If the runner dies mid-send the message comes back
 * after the lease, so a crash delays a message and never loses it.
 */
export const CLAIM_LEASE_SECONDS = 10 * 60;

/** A message that carries a link keeps it for a day at most, sent or not (master plan section 3, Email). */
export const LINK_RETENTION_SECONDS = 24 * 60 * 60;

/** Seconds until the next attempt after `attemptsMade` attempts have failed, or `null` when there are no attempts left. */
export function retryDelaySeconds(attemptsMade: number): number | null {
  if (!Number.isInteger(attemptsMade) || attemptsMade < 1) throw new RangeError(`attemptsMade must be a whole number from 1, received ${attemptsMade}`);
  if (attemptsMade >= MAX_SEND_ATTEMPTS) return null;
  return RETRY_DELAYS_SECONDS[attemptsMade - 1] ?? null;
}
