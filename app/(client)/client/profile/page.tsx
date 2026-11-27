import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CalendarConnections } from "@/components/calendar/calendar-connections";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { calendarSetupFromEnv } from "@/server/calendar";
import { listMyCalendarConnections } from "@/server/calendar/connections";
import { getDatabase } from "@/server/db/client";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile({ searchParams }: { searchParams: PageProps<"/client/profile">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const setup = calendarSetupFromEnv();
  const connections = setup === null ? [] : await listMyCalendarConnections(getDatabase("leads_client").db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <ProfileScreen role="leads_client" orgId={view.actor.orgId} userId={view.actor.userId} />
      {setup === null ? null : (
        <CalendarConnections
          providers={Object.keys(setup.providers) as ("google" | "microsoft")[]}
          connections={connections.map((item) => ({ provider: item.provider, status: item.status, lastSyncedAt: item.lastSyncedAt?.toISOString() ?? null }))}
          outcome={typeof params.calendar === "string" ? params.calendar : undefined}
        />
      )}
    </div>
  );
}

export default function ClientProfilePage({ searchParams }: PageProps<"/client/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}
