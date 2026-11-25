import Link from "next/link";
import { ClosedTag } from "@/components/kit/closed-tag";
import { SortHead } from "@/components/kit/sort-head";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { LeadViewer } from "@/lib/leads/lead-actions";
import type { Sort } from "@/lib/leads/sort";
import { contestWindow } from "@/lib/leads/windows";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { When } from "@/components/kit/when";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContestOutcomeModal, DownloadIcsButton, JoinMeetButton, RecordMeetingOutcomeModal, type MeetingItemData } from "./meeting-actions";

export interface MeetingRow extends MeetingItemData {
  readonly leadRef: string;
  /** The client's name, shown to coordinators and agencies, who work for several clients. */
  readonly clientName?: string;
}

/** Where a meeting is in its life: still to come, the call has passed and the outcome is due, or finished. */
export type MeetingGroup = "upcoming" | "due" | "done";

export function meetingGroup(meeting: Pick<MeetingItemData, "outcome" | "scheduledStartTime">, now: Date): MeetingGroup {
  if (meeting.outcome !== "scheduled") return "done";
  return new Date(meeting.scheduledStartTime).getTime() <= now.getTime() ? "due" : "upcoming";
}

type MeetingOutcome = "scheduled" | "held" | "client_no_show" | "prospect_no_show" | "rescheduled" | "cancelled";

/** A scheduled meeting whose time has passed reads as "Outcome due", the same word the lead stage uses. */
function Stage({ meeting, group }: { readonly meeting: MeetingRow; readonly group: MeetingGroup }) {
  if (group === "due") return <StatusChip kind="lead" status="outcome_due" size="sm" />;
  return <StatusChip kind="meeting" status={meeting.outcome as MeetingOutcome} size="sm" />;
}

/**
 * The meetings of one portal as a table. On a phone the campaign column goes and the time moves under the prospect's name; the stage
 * and the actions always stay. The next meeting to happen carries the selected wash.
 */
export function MeetingsTable({
  meetings,
  canWrite,
  showBrand = false,
  now,
  closedCampaigns,
  leadsPath,
  outcomeSide = "tenant",
  viewer = "supply",
  showHost = false,
  sort = null,
  sortHref,
}: {
  readonly meetings: readonly MeetingRow[];
  readonly canWrite: boolean;
  readonly showBrand?: boolean;
  readonly now: Date;
  readonly closedCampaigns?: ReadonlySet<string>;
  /** The leads list of the portal; a meeting's prospect links to the lead record under it. */
  readonly leadsPath?: string;
  /** Whose action records an outcome: a tenant's own, or Fynix's. */
  readonly outcomeSide?: "tenant" | "fynix";
  /** Which side is looking: it decides who may contest an outcome and who must pick new times. */
  readonly viewer?: LeadViewer;
  /** The client and Fynix see the host's name. */
  readonly showHost?: boolean;
  readonly sort?: Sort | null;
  /** The address of the table with a new `?sort=` value; without it the headers do not sort. */
  readonly sortHref?: (sortValue: string) => string;
}) {
  const sortable = sortHref !== undefined;
  const next = meetings
    .filter((meeting) => meetingGroup(meeting, now) === "upcoming")
    .reduce<MeetingRow | null>((soonest, meeting) => (soonest === null || new Date(meeting.scheduledStartTime) < new Date(soonest.scheduledStartTime) ? meeting : soonest), null);

  return (
    <div className="px-2.5">
      <Table>
        <TableHeader>
          <TableRow className="hover:[&>th]:bg-navy-04">
            {sortable ? <SortHead label="Prospect" sortKey="prospect" sort={sort} hrefFor={sortHref} /> : <TableHead>Prospect</TableHead>}
            <TableHead className="max-xl:hidden">Campaign</TableHead>
            {showHost ? <TableHead className="max-xl:hidden">Host</TableHead> : null}
            {sortable ? <SortHead label="When" sortKey="meeting" sort={sort} hrefFor={sortHref} className="max-xl:hidden" /> : <TableHead className="max-xl:hidden">When</TableHead>}
            {sortable ? <SortHead label="Stage" sortKey="stage" sort={sort} hrefFor={sortHref} className="max-md:hidden" /> : <TableHead className="max-md:hidden">Stage</TableHead>}
            <TableHead className="text-right max-md:hidden">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((item) => {
            const group = meetingGroup(item, now);
            const closed = item.campaignId !== undefined && closedCampaigns?.has(item.campaignId) === true;
            const mySide = viewer === "client" ? "client" : "supply";
            const pickRequired = item.openProposalBy != null && viewer !== "fynix" && item.openProposalBy !== mySide;
            const contest = contestWindow({
              viewer,
              stage: item.leadStage ?? "",
              outcome: item.outcome,
              recordedAt: item.recordedAt == null ? null : new Date(item.recordedAt),
              recordedByRole: item.recordedByRole ?? null,
              contestedAt: item.contestedAt == null ? null : new Date(item.contestedAt),
              now,
            });
            const recordHref = leadsPath === undefined ? undefined : `${leadsPath}/${item.leadRef}`;
            const notes = (
              <>
                {pickRequired ? <Badge variant="amber" size="sm">New times proposed</Badge> : null}
                {item.openProposalBy != null && !pickRequired ? <span className="text-caption text-ink-muted">{viewer === "fynix" ? "New times proposed" : "Times proposed, waiting"}</span> : null}
                {item.contestedAt != null ? <Badge variant="amber" size="sm">Outcome contested</Badge> : null}
              </>
            );
            const actions = (
              <span className="relative inline-flex flex-wrap items-center justify-end gap-1.5">
                {pickRequired && recordHref !== undefined ? (
                  <Link href={recordHref} className={buttonVariants({ variant: "default", size: "xs" })}>
                    Pick a time
                  </Link>
                ) : null}
                {contest.canContest ? <ContestOutcomeModal meetingId={item.id} prospectName={item.prospectName} timeLeft={contest.label} /> : null}
                {group === "due" && canWrite ? <RecordMeetingOutcomeModal meetingId={item.id} prospectName={item.prospectName} side={outcomeSide} /> : null}
                {group !== "done" ? <JoinMeetButton url={item.googleMeetUrl} /> : null}
                {group !== "done" ? <DownloadIcsButton
                    meeting={{
                      id: item.id,
                      publicRef: item.publicRef,
                      campaignName: item.campaignName,
                      prospectName: item.prospectName,
                      prospectCompany: item.prospectCompany,
                      googleMeetUrl: item.googleMeetUrl,
                      scheduledStartTime: item.scheduledStartTime,
                      durationMinutes: item.durationMinutes,
                      outcome: item.outcome,
                    }}
                  /> : null}
              </span>
            );
            return (
              <TableRow key={item.id} data-state={item === next ? "selected" : undefined} className="relative">
                <TableCell className="max-md:py-3">
                  <Person
                    name={item.prospectName}
                    href={leadsPath === undefined ? undefined : `${leadsPath}/${item.leadRef}`}
                    sub={
                      <>
                        <span className="xl:hidden">
                          <When at={item.scheduledStartTime} />
                        </span>
                        <span className="font-mono max-xl:hidden">{item.publicRef}</span>
                      </>
                    }
                  />
                  <span className="mt-1.5 flex max-w-[calc(100vw-8rem)] flex-wrap items-center gap-1.5 whitespace-normal md:hidden">
                    <Stage meeting={item} group={group} />
                    {notes}
                    {closed ? <ClosedTag /> : null}
                    {item.leadStage === "prospect_no_show" ? <span className="text-caption text-ink-muted">Closed, no further action</span> : null}
                    {actions}
                  </span>
                </TableCell>
                <TableCell className="max-xl:hidden">
                  <span className="flex flex-wrap items-center gap-1.5 leading-tight">
                    <span>
                      {item.campaignName}
                      <span className="block text-caption text-ink-muted">
                        {showBrand && item.clientName !== undefined ? `${item.clientName}, ` : ""}
                        {item.prospectCompany}
                      </span>
                    </span>
                    {closed ? <ClosedTag /> : null}
                  </span>
                </TableCell>
                {showHost ? <TableCell className="max-xl:hidden">{item.hostName ?? <span className="text-ink-muted">Not set</span>}</TableCell> : null}
                <TableCell className="max-xl:hidden">
                  <span className="block leading-tight">
                    <When at={item.scheduledStartTime} />
                    <span className="block text-caption text-ink-muted">{item.durationMinutes} minutes</span>
                  </span>
                </TableCell>
                <TableCell className="max-md:hidden">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Stage meeting={item} group={group} />
                    {notes}
                    {closed ? <span className="xl:hidden"><ClosedTag /></span> : null}
                  </span>
                  {item.leadStage === "prospect_no_show" ? <span className="mt-0.5 block text-caption text-ink-muted">Closed, no further action</span> : null}
                  {group === "done" && item.notes ? <span className="mt-0.5 block max-w-[22ch] truncate text-caption text-ink-muted max-md:hidden">{item.notes}</span> : null}
                </TableCell>
                <TableCell className="text-right max-md:hidden">
                  {actions}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
