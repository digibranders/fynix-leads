const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact waiting time for queue rows: "12m", "5h", "2d 4h", "9d". */
export function formatWaiting(since: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - since.getTime());
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  const days = Math.floor(ms / DAY);
  if (days >= 7) return `${days}d`;
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/** Spec section 10: the client reminder fires for leads pending over 24 hours. */
export function isOverdue(since: Date, now: Date, hours = 24): boolean {
  return now.getTime() - since.getTime() > hours * HOUR;
}
