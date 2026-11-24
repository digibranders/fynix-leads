"use client";

import { CalendarPlus, CircleNotch, VideoCamera, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateIcsCalendar } from "@/lib/meetings/ics";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { recordMeetingOutcomeAction } from "@/server/domain/meeting-actions";

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

const OUTCOMES = [
  { value: "held", label: "Held (meeting completed)" },
  { value: "client_no_show", label: "Client no-show" },
  { value: "prospect_no_show", label: "Prospect no-show" },
] as const;

/** Records how a call went. A dialog, because it needs words and cannot be undone. */
export function RecordMeetingOutcomeModal({ meetingId, prospectName }: { readonly meetingId: string; readonly prospectName?: string }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>("held");
  const [state, formAction, pending] = useActionState(recordMeetingOutcomeAction, IDLE_TENANT_ACTION);
  const selectId = useId();
  const notesId = useId();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Outcome recorded.");
    }
  }, [state]);

  return (
    <>
      <Button type="button" variant="default" size="xs" onClick={() => setOpen(true)} aria-label={prospectName === undefined ? "Record outcome" : `Record the outcome for ${prospectName}`}>
        Record outcome
      </Button>
      <Dialog open={open && state.status !== "success"} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form action={formAction} noValidate className="grid gap-4">
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="outcome" value={outcome} />
            <DialogHeader>
              <DialogTitle>Record the outcome</DialogTitle>
              <DialogDescription>Say how the call went. This is final once saved.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={selectId}>Meeting outcome</Label>
              <Choice id={selectId} value={outcome} onValueChange={setOutcome} options={OUTCOMES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={notesId}>Notes (optional)</Label>
              <Textarea id={notesId} name="notes" rows={3} placeholder="Add context for Fynix" />
            </div>
            {state.status === "error" ? (
              <p role="alert" className="flex items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
                <WarningCircle aria-hidden size={18} weight="fill" className="mt-px shrink-0" />
                {state.message ?? "Could not record the outcome."}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Save outcome
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
