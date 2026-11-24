/** A count on a badge: the number up to 99, then "99+" so the badge never outgrows its shape. */
export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** The words a screen reader gets for a badge: "3 unread", "99+ waiting". `kind` defaults to what the item counts today. */
export function badgeLabel(count: number, kind: "waiting" | "unread" = "waiting"): string {
  return `${formatBadge(count)} ${kind}`;
}
