import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/auth/notice";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { OwnEvents } from "@/components/calendar/own-events-section";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCalendarQuery } from "@/lib/calendar/view";
import { getDomain } from "@/server/domain";
import { listCalendarWarnings } from "@/server/calendar/connections";
import { loadCalendarForFynix } from "@/server/domain/calendar-data";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Calendar" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Calendar({ searchParams }: { searchParams: PageProps<"/fynix/calendar">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const warnings = await listCalendarWarnings(getDomain().fynixDb, view.actor);
  const data = await loadCalendarForFynix(getDomain(), view.actor, { team: one(params.team), agency: one(params.agency), query });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="The team and the meetings of every client. Choose a client to see its team." />
      {warnings.length === 0 ? null : (
        <Notice tone="amber">
          {warnings.map((warning) => `${warning.personName} at ${warning.clientName}: the ${warning.provider === "google" ? "Google" : "Microsoft"} calendar needs to be connected again.`).join(" ")}
        </Notice>
      )}
      <CalendarScreen data={data} query={query} basePath="/fynix/calendar" now={now.toISOString()} />
      <Suspense fallback={null}>
        <OwnEvents who={{ userId: view.actor.userId, kind: "fynix", orgId: null }} query={query} now={now} />
      </Suspense>
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
