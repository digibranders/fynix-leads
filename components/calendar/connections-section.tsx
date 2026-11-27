import { CalendarConnections } from "@/components/calendar/calendar-connections";
import { calendarSetupFromEnv } from "@/server/calendar";
import { listMyCalendarConnections } from "@/server/calendar/connections";
import type { PersonRef } from "@/server/calendar/person";
import { getDomain } from "@/server/domain";

/** Connect calendar, for the profile page of any signed-in person. Nothing is drawn while calendar connection is off. */
export async function CalendarConnectionsSection({ who, outcome }: { readonly who: PersonRef; readonly outcome: string | undefined }) {
  const setup = calendarSetupFromEnv();
  if (setup === null) return null;
  const connections = await listMyCalendarConnections(getDomain().authDb, who);
  return (
    <CalendarConnections
      providers={Object.keys(setup.providers) as ("google" | "microsoft")[]}
      connections={connections.map((item) => ({ provider: item.provider, status: item.status, lastSyncedAt: item.lastSyncedAt?.toISOString() ?? null }))}
      outcome={outcome}
    />
  );
}
