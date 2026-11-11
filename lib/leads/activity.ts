import type { ActivityEvent } from "@/lib/domain/types";
import { formatDayInZone } from "@/lib/time/zones";

export type TimelineItem =
  | { kind: "event"; event: ActivityEvent }
  /** A run of consecutive system events, newest first. */
  | { kind: "system"; events: ActivityEvent[] };

export type DayGroup = { key: string; label: string; items: TimelineItem[] };

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Newest first, grouped by calendar day in the viewer's zone, with runs of system events collapsed into one item. */
export function groupActivity(events: readonly ActivityEvent[], timeZone: string): DayGroup[] {
  const newestFirst = events
    .map((event, index) => ({ event, index, time: new Date(event.at).getTime() }))
    .sort((a, b) => b.time - a.time || b.index - a.index);

  const groups: DayGroup[] = [];
  for (const { event, time } of newestFirst) {
    const date = new Date(time);
    const key = dayKey(date, timeZone);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatDayInZone(date, timeZone), items: [] };
      groups.push(group);
    }
    const last = group.items[group.items.length - 1];
    if (event.kind === "system" && last?.kind === "system") last.events.push(event);
    else group.items.push(event.kind === "system" ? { kind: "system", events: [event] } : { kind: "event", event });
  }
  return groups;
}
