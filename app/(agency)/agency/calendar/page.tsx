import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { OwnEvents } from "@/components/calendar/own-events-section";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCalendarQuery } from "@/lib/calendar/view";
import { getDatabase } from "@/server/db/client";
import { loadCalendarForTenant } from "@/server/domain/calendar-data";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Calendar" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Calendar({ searchParams }: { searchParams: PageProps<"/agency/calendar">["searchParams"] }) {
  const view = await requireAgency();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const data = await loadCalendarForTenant(getDatabase("leads_agency").db, view.actor, "agency", { team: one(params.team), query });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="When the people at each client are free or busy. Choose a client to see its team." />
      <CalendarScreen data={data} query={query} basePath="/agency/calendar" now={now.toISOString()} />
      <Suspense fallback={null}>
        <OwnEvents who={{ userId: view.actor.userId, kind: "agency", orgId: view.actor.orgId }} query={query} now={now} />
      </Suspense>
    </div>
  );
}

export default function CalendarPage({ searchParams }: PageProps<"/agency/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}
