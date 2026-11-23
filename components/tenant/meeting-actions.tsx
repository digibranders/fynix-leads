"use client";

import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { Check, CircleNotch, DownloadSimple, VideoCamera, WarningCircle, X } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { generateIcsCalendar } from "@/lib/meetings/ics";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { NATIVE_FIELD } from "./field-classes";
import {
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
    <Hint label="Download .ics calendar file">
      <a
        href={href}
        download={`${meeting.publicRef}.ics`}
        aria-label={`Download calendar file for ${meeting.publicRef}`}
        className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5" })}
      >
        <DownloadSimple aria-hidden size={14} weight="bold" />
        <span>.ics</span>
      </a>
    </Hint>
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

const OUTCOMES = [
  { value: "held", label: "Held (meeting completed)" },
  { value: "client_no_show", label: "Client no-show" },
  { value: "prospect_no_show", label: "Prospect no-show" },
] as const;

export function RecordMeetingOutcomeModal({
  meetingId,
}: {
  readonly meetingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>("held");
  const [notes, setNotes] = useState("");
  const [state, formAction, pending] = useActionState(recordMeetingOutcomeAction, IDLE_TENANT_ACTION);
  const selectId = useId();
  const notesId = useId();

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Record outcome
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Record the outcome</DialogTitle>
            <DialogDescription>Say how the call went. This is final once saved.</DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="flex flex-col gap-3 text-left">
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="outcome" value={outcome} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor={selectId} className="text-xs font-semibold text-ink-2">Meeting outcome</label>
              <Choice id={selectId} value={outcome} onValueChange={setOutcome} options={OUTCOMES} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={notesId} className="text-xs font-semibold text-ink-2">Notes (optional)</label>
              <input id={notesId} name="notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add context or notes" className={NATIVE_FIELD} />
            </div>

            {state.status === "error" && (
              <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
                <WarningCircle aria-hidden size={14} weight="fill" />
                {state.message ?? "Could not record outcome."}
              </p>
            )}
            {state.status === "success" && (
              <p className="flex items-center gap-1 text-xs text-emerald-600">
                <Check aria-hidden size={14} weight="bold" />
                {state.message ?? "Outcome recorded."}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X aria-hidden />
                <span>Cancel</span>
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={pending} aria-busy={pending} className="gap-1">
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <Check aria-hidden weight="bold" />}
                <span>Save outcome</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
