import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCalendarQuery } from "@/lib/calendar/view";
import { getDomain } from "@/server/domain";
import { loadCalendarForFynix } from "@/server/domain/calendar-data";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Calendar" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Calendar({ searchParams }: { searchParams: PageProps<"/fynix/calendar">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const data = await loadCalendarForFynix(getDomain(), view.actor, { team: one(params.team), agency: one(params.agency), query });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="The team and the meetings of every client. Choose a client to see its team." />
      <CalendarScreen data={data} query={query} basePath="/fynix/calendar" now={now.toISOString()} />
    </div>
  );
}

export default function CalendarPage({ searchParams }: PageProps<"/fynix/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}
