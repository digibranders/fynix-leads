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
import { campaignFilterHrefs, closedCampaignIds, parseCampaignFilter } from "@/lib/campaign-status";
import { CampaignFilter } from "@/components/kit/campaign-filter";
import { paginate, parsePage } from "@/lib/leads/list";
import { parseSort, sortRows, sortValue } from "@/lib/leads/sort";
import { ExportButton, exportHref } from "@/components/kit/export-button";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
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

function meetingsHref(filter: { show: MeetingGroup | null; q: string; campaign?: string | null; sort?: string | null; page?: number }): string {
  const params = new URLSearchParams();
  if (filter.show) params.set("show", filter.show);
  if (filter.q.trim() !== "") params.set("q", filter.q.trim());
  if (filter.campaign) params.set("campaign", filter.campaign);
  if (filter.sort) params.set("sort", filter.sort);
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

  const db = getDatabase("leads_client").db;
  const [meetings, campaigns] = await Promise.all([listClientMeetings(db, view.actor), listTenantCampaigns(db, view.actor, "client")]);
  const campaign = parseCampaignFilter(params.campaign, campaigns);
  const now = new Date();

  const counts = { upcoming: 0, due: 0, done: 0 } satisfies Record<MeetingGroup, number>;
  for (const meeting of meetings) counts[meetingGroup(meeting, now)] += 1;

  const filtered = meetings.filter(
    (meeting) =>
      (show === null || meetingGroup(meeting, now) === show) &&
      (campaign === null || meeting.campaignId === campaign) &&
      (needle === "" ||
        meeting.prospectName.toLowerCase().includes(needle) ||
        meeting.prospectCompany.toLowerCase().includes(needle) ||
        meeting.publicRef.toLowerCase().includes(needle) ||
        meeting.campaignName.toLowerCase().includes(needle)),
  );
  // Upcoming and due meetings read soonest first; finished ones, newest first (the order the data arrives in).
  const sort = parseSort(params.sort);
  const sortParam = sortValue(sort) ?? null;
  const ordered =
    sort !== null
      ? sortRows(filtered, sort, { prospect: (m) => m.prospectName, stage: (m) => `${meetingGroup(m, now)} ${m.outcome}`, meeting: (m) => new Date(m.scheduledStartTime).getTime() })
      : show === "done"
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
                { label: "All", href: meetingsHref({ show: null, q, campaign, sort: sortParam }), count: meetings.length, active: show === null },
                ...SHOWS.map((entry) => ({ label: entry.label, href: meetingsHref({ show: entry.key, q, campaign, sort: sortParam }), count: counts[entry.key], active: show === entry.key })),
              ]}
            />
          </div>
          <Toolbar
            trailing={
              <span className="flex items-center gap-3">
                {`${filtered.length} ${filtered.length === 1 ? "meeting" : "meetings"}`}
                <ExportButton href={exportHref("meetings", campaign)} />
              </span>
            }
          >
            <SearchForm defaultValue={q} placeholder="Search by prospect, company or campaign" hidden={{ show: show ?? undefined, campaign: campaign ?? undefined, sort: sortParam ?? undefined }} />
            <CampaignFilter campaigns={campaigns} selected={campaign} {...campaignFilterHrefs(campaigns, (id) => meetingsHref({ show, q, campaign: id, sort: sortParam }))} />
          </Toolbar>
          {page.rows.length === 0 ? (
            <EmptyState icon={CalendarBlank} title="No meetings match">
              Clear the search or pick another stage to see more.
            </EmptyState>
          ) : (
            <MeetingsTable meetings={page.rows} canWrite={view.canWrite} now={now} closedCampaigns={closedCampaignIds(campaigns)} leadsPath="/client/leads" viewer="client" showHost sort={sort} sortHref={(value) => meetingsHref({ show, q, campaign, sort: value })} />
          )}
          <Pager
            from={page.from}
            to={page.to}
            total={page.total}
            prevHref={page.page > 1 ? meetingsHref({ show, q, campaign, sort: sortParam, page: page.page - 1 }) : undefined}
            nextHref={page.page < page.pages ? meetingsHref({ show, q, campaign, sort: sortParam, page: page.page + 1 }) : undefined}
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
