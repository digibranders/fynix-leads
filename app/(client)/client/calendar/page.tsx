import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationsPanel } from "@/components/calendar/invitations-panel";
import { OwnEventsPanel } from "@/components/calendar/own-events-panel";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { fetchRange, parseCalendarQuery } from "@/lib/calendar/view";
import { calendarSetupFromEnv } from "@/server/calendar";
import { listMyCalendarConnections } from "@/server/calendar/connections";
import { readOwnEvents } from "@/server/calendar/sync";
import { getDomain } from "@/server/domain";
import { getDatabase } from "@/server/db/client";
import { loadCalendarForTenant } from "@/server/domain/calendar-data";
import { listMyInvitations } from "@/server/domain/meeting-invitations";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Calendar" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Calendar({ searchParams }: { searchParams: PageProps<"/client/calendar">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const db = getDatabase("leads_client").db;
  const [data, invitations] = await Promise.all([loadCalendarForTenant(db, view.actor, "client", { team: one(params.team), query }), listMyInvitations(db, view.actor)]);
  // A connected person sees their own events with titles, read live for this request only and never stored.
  const setup = calendarSetupFromEnv();
  const connected = setup === null ? [] : (await listMyCalendarConnections(db, view.actor)).filter((item) => item.status === "connected");
  const range = fetchRange(query);
  const own = setup === null || connected.length === 0 ? null : await readOwnEvents({ authDb: getDomain().authDb, setup }, { userId: view.actor.userId, orgId: view.actor.orgId }, { start: range.from, end: range.to }, now);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="When your team is free or busy, and the meetings booked with your campaigns." />
      <InvitationsPanel
        invitations={invitations.map((invitation) => ({
          meetingId: invitation.meetingId,
          meetingRef: invitation.meetingRef,
          company: invitation.company,
          campaignName: invitation.campaignName,
          startsAt: invitation.startsAt.toISOString(),
          minutes: invitation.minutes,
          reply: invitation.reply,
          replyDueAt: invitation.replyDueAt?.toISOString() ?? null,
        }))}
      />
      <CalendarScreen data={data} query={query} basePath="/client/calendar" now={now.toISOString()} />
      {own === null ? null : <OwnEventsPanel events={own.events.map((event) => ({ title: event.title, start: event.start.toISOString(), end: event.end.toISOString(), allDay: event.allDay }))} problems={own.problems} />}
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
