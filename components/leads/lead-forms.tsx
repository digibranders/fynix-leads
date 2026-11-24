"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { ActionForm, useFormState } from "@/components/fynix/forms/action-form";
import { FormGroup, Hidden, SelectField, TextAreaField } from "@/components/fynix/forms/form-parts";
import { Notice } from "@/components/auth/notice";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/date-time";
import { decideLeadAction, pickTimeAction, proposeTimesAction, recordOutcomeAction, rejectLeadAction } from "@/server/domain/lead-flow-actions";
import { fynixRecordOutcomeAction, overturnRejectionAction } from "@/server/fynix/actions";

const NOTE_HELPER = "At least 5 characters. It stays in the lead's history.";

/** Confirms the time the client chose. Picking a time only books the meeting. */
export function PickTimeForm({ leadId, time }: { leadId: string; time: string }) {
  return (
    <ActionForm action={pickTimeAction} submitLabel="Book this meeting" pendingLabel="Booking" savedMessage="Meeting booked">
      <Hidden name="leadId" value={leadId} />
      <Hidden name="selectedMeetingTime" value={time} />
      <FormGroup>
        <p className="text-row font-semibold">
          <When at={time} />
        </p>
        <p className="text-body text-ink-muted">This books the meeting. It does not accept the lead. You answer after the meeting.</p>
      </FormGroup>
    </ActionForm>
  );
}

/** A local date and time as the ISO instant the server reads. */
const toInstant = (local: string): string => (local === "" ? "" : new Date(local).toISOString());

function earliestDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TimesField() {
  const [times, setTimes] = useState<readonly string[]>([""]);
  const state = useFormState();
  const error = state.status === "error" ? state.fields.proposedTimes : undefined;
  return (
    <div className="flex flex-col gap-3">
      {times.map((time, index) => (
        <div key={index} className="flex items-center gap-2">
          <DateTimeField value={time} min={earliestDay()} invalid={error !== undefined} onChange={(next) => setTimes(times.map((entry, at) => (at === index ? next : entry)))} aria-label={`Time ${index + 1}`} />
          <input type="hidden" name="proposedTimes" value={toInstant(time)} />
          {times.length > 1 ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setTimes(times.filter((_, at) => at !== index))} aria-label={`Remove time ${index + 1}`}>
              <Trash aria-hidden />
            </Button>
          ) : null}
        </div>
      ))}
      {times.length < 3 ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setTimes([...times, ""])}>
            <Plus aria-hidden weight="bold" />
            Add a time
          </Button>
        </div>
      ) : null}
      {error !== undefined ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The client offers one to three other times; the lead stays in the queue until one of the offered times is picked. */
export function ProposeTimesForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={proposeTimesAction} submitLabel="Propose these times" pendingLabel="Saving" savedMessage="Times proposed">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">Offer one to three times that suit the host. Times are in your own time zone.</p>
        <TimesField />
      </FormGroup>
    </ActionForm>
  );
}

/** Reject a lead before its meeting. The note is required. */
export function RejectLeadForm({ leadId, booked }: { leadId: string; booked: boolean }) {
  return (
    <ActionForm action={rejectLeadAction} submitLabel="Reject this lead" pendingLabel="Rejecting" savedMessage="Lead rejected">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <Notice tone="amber" compact>
          {booked ? "The booked meeting is cancelled and the lead counts as zero. This cannot be undone." : "The lead counts as zero. This cannot be undone."}
        </Notice>
        <TextAreaField name="declineReason" label="Note" rows={4} helper={`${NOTE_HELPER} The team that sent it reads it as from the client.`} />
      </FormGroup>
    </ActionForm>
  );
}

/** Accept or reject a lead after its meeting. The note is required both ways. */
export function DecideLeadForm({ leadId, decision }: { leadId: string; decision: "accept" | "reject" }) {
  const accepting = decision === "accept";
  return (
    <ActionForm
      action={decideLeadAction}
      submitLabel={accepting ? "Accept this lead" : "Reject this lead"}
      pendingLabel={accepting ? "Accepting" : "Rejecting"}
      savedMessage={accepting ? "Lead accepted" : "Lead rejected"}
    >
      <Hidden name="leadId" value={leadId} />
      <Hidden name="decision" value={decision} />
      <FormGroup>
        <Notice tone={accepting ? "green" : "amber"} compact>
          {accepting ? "The lead counts as one, in the month of its meeting." : "The lead counts as zero. Fynix reads your note and may change the answer."}
        </Notice>
        <TextAreaField name="note" label="Note" rows={4} helper={accepting ? NOTE_HELPER : `${NOTE_HELPER} The team that sent it reads it as from the client.`} />
      </FormGroup>
    </ActionForm>
  );
}

const OUTCOMES = [
  { value: "held", label: "The meeting was held" },
  { value: "client_no_show", label: "The client did not come" },
  { value: "prospect_no_show", label: "The prospect did not come" },
] as const;

/** Record how a meeting went. `side` picks the action: Fynix has its own, audited. */
export function RecordOutcomeForm({ meetingId, side = "tenant" }: { meetingId: string; side?: "tenant" | "fynix" }) {
  return (
    <ActionForm action={side === "fynix" ? fynixRecordOutcomeAction : recordOutcomeAction} submitLabel="Save outcome" pendingLabel="Saving" savedMessage="Outcome recorded">
      <Hidden name="meetingId" value={meetingId} />
      <FormGroup>
        <SelectField name="outcome" label="What happened" options={OUTCOMES} placeholder="Choose an outcome" />
        <TextAreaField name="notes" label="Notes" rows={3} helper="Optional." />
        <p className="text-caption text-ink-muted">The first outcome recorded is the one that counts. A prospect no-show closes the lead.</p>
      </FormGroup>
    </ActionForm>
  );
}

/** Fynix changes a client's rejection to accepted, with its own note. */
export function OverturnRejectionForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={overturnRejectionAction} submitLabel="Change to accepted" pendingLabel="Saving" savedMessage="Rejection changed to accepted">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">The lead counts as one, in the month of its meeting. The client&apos;s note stays in the history.</p>
        <TextAreaField name="note" label="Note" rows={4} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}
