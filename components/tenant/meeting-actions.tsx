"use client";

import { Check, CircleNotch, DownloadSimple, VideoCamera, WarningCircle, X } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { generateIcsCalendar } from "@/lib/meetings/ics";
import { Button, buttonVariants } from "@/components/ui/button";
import { NATIVE_FIELD } from "./field-classes";
import {
  IDLE_TENANT_ACTION,
  recordMeetingOutcomeAction,
} from "@/server/domain/meeting-actions";

export interface MeetingItemData {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly googleMeetUrl: string;
  readonly scheduledStartTime: Date | string;
  readonly durationMinutes: number;
  readonly outcome: string;
  readonly notes?: string | null;
}

export function DownloadIcsButton({ meeting }: { readonly meeting: MeetingItemData }) {
  const startTime = new Date(meeting.scheduledStartTime);
  const ics = generateIcsCalendar({
    uid: `${meeting.publicRef}@fynix.digital`,
    summary: `Meeting: ${meeting.campaignName} - ${meeting.prospectName}`,
    description: `Campaign meeting with ${meeting.prospectName} (${meeting.prospectCompany}). Join with Google Meet: ${meeting.googleMeetUrl}`,
    location: meeting.googleMeetUrl,
    startTime,
    durationMinutes: meeting.durationMinutes,
  });

  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return (
    <a
      href={href}
      download={`${meeting.publicRef}.ics`}
      className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5" })}
      title="Download .ics calendar file"
    >
      <DownloadSimple aria-hidden size={14} weight="bold" />
      <span>.ics</span>
    </a>
  );
}

export function JoinMeetButton({ url }: { readonly url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "default", size: "sm", className: "gap-1.5" })}
    >
      <VideoCamera aria-hidden size={14} weight="bold" />
      <span>Join Meet</span>
    </a>
  );
}

export function RecordMeetingOutcomeModal({
  meetingId,
}: {
  readonly meetingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"held" | "client_no_show" | "prospect_no_show">("held");
  const [notes, setNotes] = useState("");
  const [state, formAction, pending] = useActionState(recordMeetingOutcomeAction, IDLE_TENANT_ACTION);
  const selectId = useId();
  const notesId = useId();

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Record Outcome
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded  p-3 bg-surface text-left">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="outcome" value={outcome} />

      <label htmlFor={selectId} className="text-xs font-semibold text-ink-2">
        Meeting Outcome
      </label>
      <select
        id={selectId}
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as "held" | "client_no_show" | "prospect_no_show")}
        className={NATIVE_FIELD}
      >
        <option value="held">Held (Meeting completed successfully)</option>
        <option value="client_no_show">Client No-Show</option>
        <option value="prospect_no_show">Prospect No-Show</option>
      </select>

      <label htmlFor={notesId} className="text-xs font-semibold text-ink-2">
        Notes (optional)
      </label>
      <input
        id={notesId}
        name="notes"
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add context or notes"
        className={NATIVE_FIELD}
      />

      <div className="flex items-center gap-2 mt-1">
        <Button
          type="submit"
          variant="default"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          className="gap-1"
        >
          {pending ? (
            <CircleNotch aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Check aria-hidden weight="bold" />
          )}
          <span>Save Outcome</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden />
          <span>Cancel</span>
        </Button>
      </div>

      {state.status === "error" && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive mt-1">
          <WarningCircle aria-hidden size={14} weight="fill" />
          {state.message ?? "Could not record outcome."}
        </p>
      )}
      {state.status === "success" && (
        <p className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
          <Check aria-hidden size={14} weight="bold" />
          {state.message ?? "Outcome recorded."}
        </p>
      )}
    </form>
  );
}
