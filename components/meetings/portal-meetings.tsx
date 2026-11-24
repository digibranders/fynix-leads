import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { CampaignFilter } from "@/components/kit/campaign-filter";
import { ExportButton, exportHref } from "@/components/kit/export-button";
import { EmptyState } from "@/components/kit/empty-state";
import { Pager } from "@/components/kit/pager";
import { Panel } from "@/components/kit/panel";
import { TabNav } from "@/components/kit/tab-nav";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { campaignFilterHrefs, closedCampaignIds, type CampaignChoice } from "@/lib/campaign-status";
import type { LeadViewer } from "@/lib/leads/lead-actions";
import { paginate } from "@/lib/leads/list";
import { sortRows, sortValue, type Sort } from "@/lib/leads/sort";
import { MeetingsTable, meetingGroup, type MeetingGroup, type MeetingRow } from "./meetings-table";

export const MEETING_SHOWS: readonly { key: MeetingGroup; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "due", label: "Outcome due" },
  { key: "done", label: "Done" },
];

export function meetingsHref(basePath: string, filter: { show: MeetingGroup | null; q: string; campaign?: string | null; sort?: string | null; page?: number }): string {
  const params = new URLSearchParams();
  if (filter.show) params.set("show", filter.show);
  if (filter.q.trim() !== "") params.set("q", filter.q.trim());
  if (filter.campaign) params.set("campaign", filter.campaign);
  if (filter.sort) params.set("sort", filter.sort);
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

/** The count line under the page title, from the meetings themselves. */
export function meetingsSummary(meetings: readonly MeetingRow[], now: Date, emptyText: string): string {
  if (meetings.length === 0) return emptyText;
  const counts = { upcoming: 0, due: 0, done: 0 } satisfies Record<MeetingGroup, number>;
  for (const meeting of meetings) counts[meetingGroup(meeting, now)] += 1;
  return `${counts.upcoming} upcoming, ${counts.due} waiting for an outcome, ${counts.done} done.`;
}

/** The meetings list of a supplier or an agency: stage tabs, search, table, pager. State is in the URL, as on the client's list. */
export function PortalMeetings({
  meetings,
  basePath,
  show,
  q,
  page: requestedPage,
  canWrite,
  outcomeSide = "tenant",
  now,
  emptyText,
  campaigns,
  campaign = null,
  sort = null,
  viewer = "supply",
  showHost = false,
  exportCampaignId,
}: {
  readonly meetings: readonly (MeetingRow & { readonly campaignId?: string; readonly campaignName: string; readonly prospectCompany: string })[];
  readonly basePath: string;
  readonly show: MeetingGroup | null;
  readonly q: string;
  readonly page: number;
  readonly canWrite: boolean;
  /** Whose action records an outcome. Fynix has its own. */
  readonly outcomeSide?: "tenant" | "fynix";
  readonly now: Date;
  readonly emptyText: string;
  /** The campaigns to filter by; left out inside a campaign. */
  readonly campaigns?: readonly CampaignChoice[];
  readonly campaign?: string | null;
  /** `?sort=`, already read. */
  readonly sort?: Sort | null;
  /** Which side is looking, for contesting an outcome and picking new times. */
  readonly viewer?: LeadViewer;
  /** The client and Fynix see the host's name. */
  readonly showHost?: boolean;
  /** Inside a campaign the export is that campaign's. */
  readonly exportCampaignId?: string;
}) {
  if (meetings.length === 0) {
    return (
      <Panel>
        <EmptyState icon={CalendarBlank} title="No meetings scheduled yet">
          {emptyText}
        </EmptyState>
      </Panel>
    );
  }

  const needle = q.trim().toLowerCase();
  const closed = closedCampaignIds(campaigns ?? []);
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
        meeting.campaignName.toLowerCase().includes(needle) ||
        (meeting.clientBrandName ?? "").toLowerCase().includes(needle)),
  );
  const sortParam = sortValue(sort) ?? null;
  // Upcoming and due meetings read soonest first; finished ones, newest first (the order the data arrives in). A chosen column overrides both.
  const ordered =
    sort !== null
      ? sortRows(filtered, sort, {
          prospect: (m) => m.prospectName,
          stage: (m) => `${meetingGroup(m, now)} ${m.outcome}`,
          meeting: (m) => new Date(m.scheduledStartTime).getTime(),
        })
      : show === "done"
      ? filtered
      : [...filtered].sort((a, b) => {
          const rank = (m: (typeof filtered)[number]) => (meetingGroup(m, now) === "done" ? 1 : 0);
          return rank(a) - rank(b) || new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime();
        });
  const page = paginate(ordered, requestedPage);

  return (
    <Panel aria-label="Meetings">
      <div className="pt-1.5">
        <TabNav
          label="Meeting stage"
          items={[
            { label: "All", href: meetingsHref(basePath, { show: null, q, campaign, sort: sortParam }), count: meetings.length, active: show === null },
            ...MEETING_SHOWS.map((entry) => ({ label: entry.label, href: meetingsHref(basePath, { show: entry.key, q, campaign, sort: sortParam }), count: counts[entry.key], active: show === entry.key })),
          ]}
        />
      </div>
      <Toolbar
        trailing={
          <span className="flex items-center gap-3">
            {`${filtered.length} ${filtered.length === 1 ? "meeting" : "meetings"}`}
            <ExportButton href={exportHref("meetings", campaign ?? exportCampaignId ?? null)} />
          </span>
        }
      >
        <SearchForm defaultValue={q} placeholder="Search by prospect, company, campaign or client" hidden={{ show: show ?? undefined, campaign: campaign ?? undefined, sort: sortParam ?? undefined }} />
        {campaigns !== undefined ? <CampaignFilter campaigns={campaigns} selected={campaign} {...campaignFilterHrefs(campaigns, (id) => meetingsHref(basePath, { show, q, campaign: id, sort: sortParam }))} /> : null}
      </Toolbar>
      {page.rows.length === 0 ? (
        <EmptyState icon={CalendarBlank} title="No meetings match">
          Clear the search or pick another stage to see more.
        </EmptyState>
      ) : (
        <MeetingsTable meetings={page.rows} canWrite={canWrite} now={now} showBrand closedCampaigns={closed} leadsPath={/^\/[a-z]+\/meetings$/.test(basePath) ? basePath.replace(/meetings$/, "leads") : "/fynix/leads"} outcomeSide={outcomeSide} viewer={viewer} showHost={showHost} sort={sort} sortHref={(value) => meetingsHref(basePath, { show, q, campaign, sort: value })} />
      )}
      <Pager
        from={page.from}
        to={page.to}
        total={page.total}
        prevHref={page.page > 1 ? meetingsHref(basePath, { show, q, campaign, sort: sortParam, page: page.page - 1 }) : undefined}
        nextHref={page.page < page.pages ? meetingsHref(basePath, { show, q, campaign, sort: sortParam, page: page.page + 1 }) : undefined}
      />
    </Panel>
  );
}
