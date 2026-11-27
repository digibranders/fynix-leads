import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationsPanel } from "@/components/calendar/invitations-panel";
import { OwnEventsPanel } from "@/components/calendar/own-events-panel";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { fetchRange, parseCalendarQuery, type CalendarQuery } from "@/lib/calendar/view";
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

/** A connected person sees their own events with titles, read live for this request only and never stored. It streams in after the grid, because the providers take a second or two. */
async function OwnEvents({ actor, query, now }: { actor: Awaited<ReturnType<typeof requireClient>>["actor"]; query: CalendarQuery; now: Date }) {
  const setup = calendarSetupFromEnv();
  if (setup === null) return null;
  const db = getDatabase("leads_client").db;
  const connected = (await listMyCalendarConnections(db, actor)).filter((item) => item.status === "connected");
  if (connected.length === 0) return null;
  const range = fetchRange(query);
  const own = await readOwnEvents({ authDb: getDomain().authDb, setup }, { userId: actor.userId, orgId: actor.orgId }, { start: range.from, end: range.to }, now);
  return <OwnEventsPanel events={own.events.map((event) => ({ title: event.title, start: event.start.toISOString(), end: event.end.toISOString(), allDay: event.allDay }))} problems={own.problems} />;
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/client/calendar">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const now = new Date();
  const query = parseCalendarQuery({ view: one(params.view), date: one(params.date) }, now.toISOString().slice(0, 10));
  const db = getDatabase("leads_client").db;
  const [data, invitations] = await Promise.all([loadCalendarForTenant(db, view.actor, "client", { team: one(params.team), query }), listMyInvitations(db, view.actor)]);
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
      <Suspense fallback={null}>
        <OwnEvents actor={view.actor} query={query} now={now} />
      </Suspense>
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
