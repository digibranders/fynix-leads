import { OwnEventsPanel } from "@/components/calendar/own-events-panel";
import type { CalendarQuery } from "@/lib/calendar/view";
import { fetchRange } from "@/lib/calendar/view";
import { calendarSetupFromEnv } from "@/server/calendar";
import { listMyCalendarConnections } from "@/server/calendar/connections";
import type { PersonRef } from "@/server/calendar/person";
import { readOwnEvents } from "@/server/calendar/sync";
import { getDomain } from "@/server/domain";

/**
 * A connected person sees their own events with titles under the calendar, read live for this request only and never stored. It streams in after the grid (put it inside
 * a `Suspense`), because the providers take a second or two. Nothing is drawn when calendar connection is off or the person has not connected.
 */
export async function OwnEvents({ who, query, now }: { readonly who: PersonRef; readonly query: CalendarQuery; readonly now: Date }) {
  const setup = calendarSetupFromEnv();
  if (setup === null) return null;
  const { authDb } = getDomain();
  const connected = (await listMyCalendarConnections(authDb, who)).filter((item) => item.status === "connected");
  if (connected.length === 0) return null;
  const range = fetchRange(query);
  const own = await readOwnEvents({ authDb, setup }, who, { start: range.from, end: range.to }, now);
  return <OwnEventsPanel events={own.events.map((event) => ({ title: event.title, start: event.start.toISOString(), end: event.end.toISOString(), allDay: event.allDay }))} problems={own.problems} />;
}
