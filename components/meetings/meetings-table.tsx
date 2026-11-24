import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { When } from "@/components/kit/when";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadIcsButton, JoinMeetButton, RecordMeetingOutcomeModal, type MeetingItemData } from "./meeting-actions";

export interface MeetingRow extends MeetingItemData {
  readonly leadRef: string;
  /** The client's brand, shown to suppliers and agencies, who work for several clients. */
  readonly clientBrandName?: string;
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
export function MeetingsTable({ meetings, canWrite, showBrand = false, now }: { readonly meetings: readonly MeetingRow[]; readonly canWrite: boolean; readonly showBrand?: boolean; readonly now: Date }) {
  const next = meetings
    .filter((meeting) => meetingGroup(meeting, now) === "upcoming")
    .reduce<MeetingRow | null>((soonest, meeting) => (soonest === null || new Date(meeting.scheduledStartTime) < new Date(soonest.scheduledStartTime) ? meeting : soonest), null);

  return (
    <div className="px-2.5">
      <Table>
        <TableHeader>
          <TableRow className="hover:[&>th]:bg-navy-04">
            <TableHead>Prospect</TableHead>
            <TableHead className="max-xl:hidden">Campaign</TableHead>
            <TableHead className="max-xl:hidden">When</TableHead>
            <TableHead className="max-md:hidden">Stage</TableHead>
            <TableHead className="text-right max-md:hidden">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((item) => {
            const group = meetingGroup(item, now);
            const actions = (
              <>
                {group === "due" && canWrite ? <RecordMeetingOutcomeModal meetingId={item.id} prospectName={item.prospectName} /> : null}
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
              </>
            );
            return (
              <TableRow key={item.id} data-state={item === next ? "selected" : undefined}>
                <TableCell className="max-md:py-3">
                  <Person
                    name={item.prospectName}
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
                    {actions}
                  </span>
                </TableCell>
                <TableCell className="max-xl:hidden">
                  <span className="block leading-tight">
                    {item.campaignName}
                    <span className="block text-caption text-ink-muted">
                      {showBrand && item.clientBrandName !== undefined ? `${item.clientBrandName}, ` : ""}
                      {item.prospectCompany}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="max-xl:hidden">
                  <span className="block leading-tight">
                    <When at={item.scheduledStartTime} />
                    <span className="block text-caption text-ink-muted">{item.durationMinutes} minutes</span>
                  </span>
                </TableCell>
                <TableCell className="max-md:hidden">
                  <Stage meeting={item} group={group} />
                  {group === "done" && item.notes ? <span className="mt-0.5 block max-w-[22ch] truncate text-caption text-ink-muted max-md:hidden">{item.notes}</span> : null}
                </TableCell>
                <TableCell className="text-right max-md:hidden">
                  <span className="inline-flex items-center justify-end gap-1.5">{actions}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
