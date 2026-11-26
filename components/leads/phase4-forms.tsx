"use client";

import { ActionForm, useFormState } from "@/components/fynix/forms/action-form";
import { FormGroup, Hidden, TextAreaField } from "@/components/fynix/forms/form-parts";
import { Notice } from "@/components/auth/notice";
import { When } from "@/components/kit/when";
import { SlotPicker } from "@/components/leads/slot-picker";
import type { CalendarPersonLike } from "@/lib/calendar/layout";
import { TimesField } from "@/components/leads/lead-forms";
import { bookNewTimeAction, contestOutcomeAction, pickPostponementAction, proposePostponementAction, requestRejectionReviewAction, withdrawLeadAction } from "@/server/domain/lead-flow-actions";

const NOTE_HELPER = "At least 5 characters.";

/** The source withdraws a lead before its meeting. The note is optional and stays in the history. */
export function WithdrawLeadForm({ leadId, booked }: { leadId: string; booked: boolean }) {
  return (
    <ActionForm action={withdrawLeadAction} submitLabel="Withdraw this lead" pendingLabel="Withdrawing" savedMessage="Lead withdrawn">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <Notice tone="amber" compact>
          {booked ? "The booked meeting is cancelled and the lead counts as zero. This cannot be undone." : "The lead counts as zero and leaves the client's queue. This cannot be undone."}
        </Notice>
        <TextAreaField name="note" label="Note" helper="Optional. It stays in the lead's history." />
      </FormGroup>
    </ActionForm>
  );
}

/** The source picks one new time when someone on the client team is free and invites them. The meeting keeps its link and goes back to Waiting for reply. */
export function BookNewTimeForm({ leadId, people }: { leadId: string; people: readonly CalendarPersonLike[] }) {
  return (
    <ActionForm action={bookNewTimeAction} submitLabel="Book this time" pendingLabel="Booking" savedMessage="New time booked and the client team invited">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">Pick one time when someone from the client team is free, and who to invite. The first to accept takes the meeting. It keeps its link.</p>
        <SlotPicker people={people} />
      </FormGroup>
    </ActionForm>
  );
}

/** Either side offers one to three new times for a booked meeting. The other side picks one. */
export function PostponeForm({ meetingId }: { meetingId: string }) {
  return (
    <ActionForm action={proposePostponementAction} submitLabel="Propose these times" pendingLabel="Saving" savedMessage="New times proposed">
      <Hidden name="meetingId" value={meetingId} />
      <FormGroup>
        <p className="text-body text-ink-muted">Offer one to three new times. The other side picks one and the meeting moves. It keeps its link. Times are in your own time zone.</p>
        <TimesField />
      </FormGroup>
    </ActionForm>
  );
}

function TimeChoices({ name, times }: { name: string; times: readonly string[] }) {
  const state = useFormState();
  const error = state.status === "error" ? state.fields[name] : undefined;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Time</legend>
      {times.map((time) => (
        <label key={time} className="flex cursor-pointer items-center gap-3 rounded-md bg-surface px-3.5 py-2.5 text-row font-medium has-checked:bg-selected">
          <input type="radio" name={name} value={time} className="size-4 accent-peach-deep" />
          <When at={time} />
        </label>
      ))}
      {error !== undefined ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export { TimeChoices };

/** The other side picks one of the proposed times. */
export function PickNewTimeForm({ rescheduleId, times }: { rescheduleId: string; times: readonly string[] }) {
  return (
    <ActionForm action={pickPostponementAction} submitLabel="Move the meeting" pendingLabel="Moving" savedMessage="Meeting moved">
      <Hidden name="rescheduleId" value={rescheduleId} />
      <FormGroup>
        <p className="text-body text-ink-muted">Pick the time that suits. The meeting moves to it and keeps its link.</p>
        <TimeChoices name="pickedTime" times={times} />
      </FormGroup>
    </ActionForm>
  );
}

/** Contest an outcome the other side recorded. Fynix decides. The note is required. */
export function ContestOutcomeForm({ meetingId, timeLeft }: { meetingId: string; timeLeft: string }) {
  return (
    <ActionForm action={contestOutcomeAction} submitLabel="Contest this outcome" pendingLabel="Sending" savedMessage="Outcome contested">
      <Hidden name="meetingId" value={meetingId} />
      <FormGroup>
        <Notice tone="amber" compact>
          {`Fynix decides the final outcome and may not agree. ${timeLeft}.`}
        </Notice>
        <TextAreaField name="note" label="Note" helper={`${NOTE_HELPER} Say what really happened.`} />
      </FormGroup>
    </ActionForm>
  );
}

/** The coordinator asks Fynix to look at a rejection again. The note is required. */
export function AskReviewForm({ leadId, timeLeft }: { leadId: string; timeLeft: string }) {
  return (
    <ActionForm action={requestRejectionReviewAction} submitLabel="Ask for a review" pendingLabel="Sending" savedMessage="Review requested">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <Notice tone="blue" compact>
          {`Fynix reads the client's note and yours, and may change the rejection to accepted. ${timeLeft}.`}
        </Notice>
        <TextAreaField name="note" label="Note" helper={`${NOTE_HELPER} Say why the rejection should change.`} />
      </FormGroup>
    </ActionForm>
  );
}
