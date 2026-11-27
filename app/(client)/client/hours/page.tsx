import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { HostsView, type HostDay } from "@/components/hosts/hosts-view";
import { PageHeader } from "@/components/kit/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listClientHosts, type HostHoursWindow } from "@/server/domain/hosts-tenant";

export const metadata: Metadata = { title: "Working hours" };

/** Monday first; `weekday` 0 is Sunday. */
const WEEK = [
  { weekday: 1, day: "Monday" },
  { weekday: 2, day: "Tuesday" },
  { weekday: 3, day: "Wednesday" },
  { weekday: 4, day: "Thursday" },
  { weekday: 5, day: "Friday" },
  { weekday: 6, day: "Saturday" },
  { weekday: 0, day: "Sunday" },
] as const;

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function weekOf(hours: readonly HostHoursWindow[]): HostDay[] {
  return WEEK.map(({ weekday, day }) => ({
    day,
    ranges: hours
      .filter((window) => window.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((window) => `${clock(window.startMinute)} to ${window.endMinute === 1440 ? "24:00" : clock(window.endMinute)}`),
  }));
}

async function Hours({ searchParams }: { searchParams: PageProps<"/client/hours">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const db = getDatabase("leads_client").db;
  const hosts = await listClientHosts(db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Working hours"
        description={hosts.length === 0 ? "When each person on your team can take meetings." : `${hosts.length} ${hosts.length === 1 ? "person" : "people"} on your team. Everyone sets their own hours.`}
      />
      <HostsView
        basePath="/client/hours"
        selectedId={one(params.person)}
        hosts={hosts.map((host) => ({
          memberId: host.memberId,
          name: host.name,
          jobTitle: host.jobTitle,
          own: host.own,
          windows: host.hours.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
          week: weekOf(host.hours),
          timeZone: host.hours[0]?.timeZone ?? null,
          blocks: host.blocks.map((block) => ({ id: block.id, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(), note: block.note })),
        }))}
      />
    </div>
  );
}

export default function ClientHoursPage({ searchParams }: PageProps<"/client/hours">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hours searchParams={searchParams} />
    </Suspense>
  );
}
