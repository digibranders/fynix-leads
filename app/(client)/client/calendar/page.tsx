import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCalendarQuery } from "@/lib/calendar/view";
import { getDatabase } from "@/server/db/client";
import { loadCalendarForTenant } from "@/server/domain/calendar-data";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Calendar" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Calendar({ searchParams }: { searchParams: PageProps<"/client/calendar">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const data = await loadCalendarForTenant(getDatabase("leads_client").db, view.actor, "client", { team: one(params.team), query });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="When your team is free or busy, and the meetings booked with your campaigns." />
      <CalendarScreen data={data} query={query} basePath="/client/calendar" now={now.toISOString()} />
    </div>
  );
}

export default function CalendarPage({ searchParams }: PageProps<"/client/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}
