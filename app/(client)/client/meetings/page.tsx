import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Pager } from "@/components/kit/pager";
import { Panel } from "@/components/kit/panel";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { TabNav } from "@/components/kit/tab-nav";
import { MeetingsTable, meetingGroup, type MeetingGroup } from "@/components/meetings/meetings-table";
import { paginate, parsePage } from "@/lib/leads/list";
import { getDatabase } from "@/server/db/client";
import { listClientMeetings } from "@/server/domain/meetings";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Meetings" };

const BASE = "/client/meetings";
const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);
const SHOWS: readonly { key: MeetingGroup; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "due", label: "Outcome due" },
  { key: "done", label: "Done" },
];

function meetingsHref(filter: { show: MeetingGroup | null; q: string; page?: number }): string {
  const params = new URLSearchParams();
  if (filter.show) params.set("show", filter.show);
  if (filter.q.trim() !== "") params.set("q", filter.q.trim());
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  const query = params.toString();
  return query === "" ? BASE : `${BASE}?${query}`;
}

async function Meetings({ searchParams }: { searchParams: PageProps<"/client/meetings">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const show = SHOWS.find((entry) => entry.key === one(params.show))?.key ?? null;
  const q = one(params.q) ?? "";
  const needle = q.trim().toLowerCase();

  const meetings = await listClientMeetings(getDatabase("leads_client").db, view.actor);
  const now = new Date();

  const counts = { upcoming: 0, due: 0, done: 0 } satisfies Record<MeetingGroup, number>;
  for (const meeting of meetings) counts[meetingGroup(meeting, now)] += 1;

  const filtered = meetings.filter(
    (meeting) =>
      (show === null || meetingGroup(meeting, now) === show) &&
      (needle === "" ||
        meeting.prospectName.toLowerCase().includes(needle) ||
        meeting.prospectCompany.toLowerCase().includes(needle) ||
        meeting.publicRef.toLowerCase().includes(needle) ||
        meeting.campaignName.toLowerCase().includes(needle)),
  );
  // Upcoming and due meetings read soonest first; finished ones, newest first (the order the data arrives in).
  const ordered =
    show === "done"
      ? filtered
      : [...filtered].sort((a, b) => {
          const rank = (m: (typeof filtered)[number]) => (meetingGroup(m, now) === "done" ? 1 : 0);
          return rank(a) - rank(b) || new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime();
        });
  const page = paginate(ordered, parsePage(params.page));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Meetings"
        description={
          meetings.length === 0
            ? "Discovery calls with qualified prospects appear here once you accept a time."
            : `${counts.upcoming} upcoming, ${counts.due} waiting for an outcome, ${counts.done} done.`
        }
      />

      {meetings.length === 0 ? (
        <Panel>
          <EmptyState icon={CalendarBlank} title="No meetings scheduled yet">
            Meetings confirmed from qualified leads will appear here with calendar downloads and Google Meet links.
          </EmptyState>
        </Panel>
      ) : (
        <Panel aria-label="Meetings">
          <div className="pt-1.5">
            <TabNav
              label="Meeting stage"
              items={[
                { label: "All", href: meetingsHref({ show: null, q }), count: meetings.length, active: show === null },
                ...SHOWS.map((entry) => ({ label: entry.label, href: meetingsHref({ show: entry.key, q }), count: counts[entry.key], active: show === entry.key })),
              ]}
            />
          </div>
          <Toolbar trailing={`${filtered.length} ${filtered.length === 1 ? "meeting" : "meetings"}`}>
            <SearchForm defaultValue={q} placeholder="Search by prospect, company or campaign" hidden={{ show: show ?? undefined }} />
          </Toolbar>
          {page.rows.length === 0 ? (
            <EmptyState icon={CalendarBlank} title="No meetings match">
              Clear the search or pick another stage to see more.
            </EmptyState>
          ) : (
            <MeetingsTable meetings={page.rows} canWrite={view.canWrite} now={now} />
          )}
          <Pager
            from={page.from}
            to={page.to}
            total={page.total}
            prevHref={page.page > 1 ? meetingsHref({ show, q, page: page.page - 1 }) : undefined}
            nextHref={page.page < page.pages ? meetingsHref({ show, q, page: page.page + 1 }) : undefined}
          />
        </Panel>
      )}
    </div>
  );
}

export default function ClientMeetingsPage({ searchParams }: PageProps<"/client/meetings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings searchParams={searchParams} />
    </Suspense>
  );
}
