import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { HostsView, type HostDay } from "@/components/hosts/hosts-view";
import { PageHeader } from "@/components/kit/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listClientHosts, type HostHoursWindow } from "@/server/domain/hosts-tenant";

export const metadata: Metadata = { title: "Hosts and hours" };

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

async function Hosts({ searchParams }: { searchParams: PageProps<"/client/hosts">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const hosts = await listClientHosts(getDatabase("leads_client").db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Hosts and hours"
        description={hosts.length === 0 ? "The people who take your meetings, and when they are free. Fynix sets these up with you." : `${hosts.length} ${hosts.length === 1 ? "person takes" : "people take"} your meetings. Fynix sets their hours up with you.`}
      />
      <HostsView
        basePath="/client/hosts"
        selectedId={one(params.host)}
        hosts={hosts.map((host) => ({
          memberId: host.memberId,
          name: host.name,
          jobTitle: host.jobTitle,
          campaigns: host.campaigns,
          week: weekOf(host.hours),
          timeZone: host.hours[0]?.timeZone ?? null,
          blocks: host.blocks.map((block) => ({ startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(), note: block.note })),
        }))}
      />
    </div>
  );
}

export default function ClientHostsPage({ searchParams }: PageProps<"/client/hosts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hosts searchParams={searchParams} />
    </Suspense>
  );
}
