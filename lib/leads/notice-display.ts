const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago a notice was written, in a few plain words: "Just now", "5 min ago", "3 h ago", "Yesterday", "4 d ago", then the date. */
export function relativeTime(then: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - then.getTime());
  if (ms < MINUTE) return "Just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  const days = Math.floor(ms / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A notice as the screens receive it: plain values that cross from the server to the browser. */
export interface NoticeView {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  /** The page it opens, a path inside the person's own portal. */
  readonly link: string;
  readonly read: boolean;
  readonly createdAt: string;
}

/** A notice link is only ever followed when it is a path of this app: a leading slash, and not `//host`. */
export function safeNoticeLink(link: string): string | null {
  return link.startsWith("/") && !link.startsWith("//") ? link : null;
}
