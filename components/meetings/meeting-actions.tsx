"use client";

import { CalendarPlus, VideoCamera } from "@phosphor-icons/react";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { ContestOutcomeForm } from "@/components/leads/phase4-forms";
import { RecordOutcomeForm } from "@/components/leads/lead-forms";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { generateIcsCalendar } from "@/lib/meetings/ics";

export interface MeetingItemData {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId?: string;
  readonly campaignName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly googleMeetUrl: string | null;
  readonly scheduledStartTime: Date | string;
  readonly durationMinutes: number;
  readonly outcome: string;
  readonly notes?: string | null;
  /** The stage of the lead the meeting belongs to, when the list reads it. */
  readonly leadStage?: string;
  /** The client's host. Read by the client and Fynix only. */
  readonly hostName?: string | null;
  /** The side ("client" or "supply") with an open proposal to move the meeting. */
  readonly openProposalBy?: string | null;
  /** The recorded outcome and its contest, for the 48 hour window. */
  readonly recordedAt?: Date | string | null;
  readonly recordedByRole?: string | null;
  readonly contestedAt?: Date | string | null;
}

/** A calendar file for one meeting. The file carries the Meet link only when there is one: a link is never invented. */
export function DownloadIcsButton({ meeting }: { readonly meeting: MeetingItemData }) {
  // The file is built on click, not on render: it carries a creation stamp, so building it while rendering makes the server's HTML and the browser's differ.
  function download(): void {
    const ics = generateIcsCalendar({
      uid: `${meeting.publicRef}@fynix.digital`,
      summary: `Meeting: ${meeting.campaignName} - ${meeting.prospectName}`,
      description: `Campaign meeting with ${meeting.prospectName} (${meeting.prospectCompany}).${meeting.googleMeetUrl === null ? "" : ` Join with Google Meet: ${meeting.googleMeetUrl}`}`,
      location: meeting.googleMeetUrl ?? undefined,
      startTime: new Date(meeting.scheduledStartTime),
      durationMinutes: meeting.durationMinutes,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.publicRef}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Hint label="Download a calendar file (.ics)">
      <Button type="button" variant="secondary" size="xs" onClick={download} aria-label={`Add ${meeting.publicRef} to your calendar`}>
        <CalendarPlus aria-hidden weight="bold" />
        Calendar
      </Button>
    </Hint>
  );
}

export function JoinMeetButton({ url }: { readonly url: string | null }) {
  if (url === null) return <span className="text-label text-ink-muted">Meet link to follow</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "xs" })}>
      <VideoCamera aria-hidden weight="bold" />
      Join Meet
    </a>
  );
}

/** Records how a call went, in a sheet. `side` picks the action: Fynix has its own, which is audited. */
export function RecordMeetingOutcomeModal({ meetingId, prospectName, side = "tenant" }: { readonly meetingId: string; readonly prospectName?: string; readonly side?: "tenant" | "fynix" }) {
  return (
    <FormSheet
      trigger={
        <Button type="button" variant="default" size="xs" aria-label={prospectName === undefined ? "Record outcome" : `Record the outcome for ${prospectName}`}>
          Record outcome
        </Button>
      }
      title="Record the outcome"
      description={prospectName === undefined ? "Say how the meeting went." : `How did the meeting with ${prospectName} go?`}
    >
      <RecordOutcomeForm meetingId={meetingId} side={side} />
    </FormSheet>
  );
}

/** Contests the outcome the other side recorded, in a sheet, with the time left of the 48 hours. */
export function ContestOutcomeModal({ meetingId, prospectName, timeLeft }: { readonly meetingId: string; readonly prospectName: string; readonly timeLeft: string }) {
  return (
    <FormSheet
      trigger={
        <Button type="button" variant="secondary" size="xs" aria-label={`Contest the outcome for ${prospectName}, ${timeLeft}`}>
          Contest outcome
          <span className="font-normal text-ink-muted">{timeLeft}</span>
        </Button>
      }
      title="Contest the outcome"
      description={`The other side recorded how the meeting with ${prospectName} went.`}
    >
      <ContestOutcomeForm meetingId={meetingId} timeLeft={timeLeft} />
    </FormSheet>
  );
}
