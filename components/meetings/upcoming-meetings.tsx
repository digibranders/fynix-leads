import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { DateTile, ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { buttonVariants } from "@/components/ui/button";
import { JoinMeetButton } from "./meeting-actions";

export interface UpcomingMeetingRow {
  readonly id: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly scheduledStartTime: Date | string;
  /** The Meet link a host added, or null: the row then says "Meet link to follow". A link is never made up. */
  readonly googleMeetUrl: string | null;
}

/** The Upcoming meetings panel of an overview, on every portal that has one. Each row has a Join button when a Meet link exists. */
export function UpcomingMeetings({ meetings, allHref, emptyText }: { readonly meetings: readonly UpcomingMeetingRow[]; readonly allHref: string; readonly emptyText: string }) {
  return (
    <Panel aria-label="Upcoming meetings">
      <PanelHeader
        title="Upcoming meetings"
        action={
          <Link href={allHref} className={buttonVariants({ variant: "ghost", size: "xs" })}>
            All meetings
          </Link>
        }
      />
      {meetings.length === 0 ? (
        <EmptyState icon={CalendarBlank} title="No meetings booked">
          {emptyText}
        </EmptyState>
      ) : (
        <ul className="flex flex-col pb-3">
          {meetings.map((meeting, index) => {
            const when = new Date(meeting.scheduledStartTime);
            return (
              <ListRow
                key={meeting.id}
                highlight={index === 0}
                leading={<DateTile date={when} />}
                title={meeting.prospectName}
                sub={meeting.prospectCompany}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <When at={when} style="time" />
                    <JoinMeetButton url={meeting.googleMeetUrl} />
                  </span>
                }
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
