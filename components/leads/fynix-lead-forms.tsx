"use client";

import { ActionForm } from "@/components/fynix/forms/action-form";
import { FormGroup, Hidden, SelectField, TextAreaField, TextField } from "@/components/fynix/forms/form-parts";
import { Notice } from "@/components/auth/notice";
import { TimeChoices } from "@/components/leads/phase4-forms";
import { answerForClientAction, clearOverShareAction, correctLeadAction, decideContestAction, markLostAction, markRejectionReviewedAction } from "@/server/fynix/lead-actions";

const NOTE_HELPER = "At least 5 characters. It stays in the lead's history and the audit log.";

const CONTEST_OUTCOMES = [
  { value: "held", label: "The meeting was held" },
  { value: "client_no_show", label: "The client did not come" },
  { value: "prospect_no_show", label: "The prospect did not come" },
] as const;

/** Fynix decides a contested outcome: the one it names is final and the lead carries on from it. */
export function DecideContestForm({ leadId, contestedOutcome }: { leadId: string; contestedOutcome: string }) {
  return (
    <ActionForm action={decideContestAction} submitLabel="Decide" pendingLabel="Saving" savedMessage="Contest decided">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">The outcome you choose is final. A held meeting goes to the client for an answer, a client no-show counts one, a prospect no-show closes the lead at zero.</p>
        <SelectField name="outcome" label="Final outcome" options={CONTEST_OUTCOMES} defaultValue={contestedOutcome} placeholder="Choose an outcome" />
        <TextAreaField name="note" label="Note" rows={4} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}

/** Fynix looked at a rejection and leaves it as it was. The note is optional. */
export function MarkReviewedForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={markRejectionReviewedAction} submitLabel="Mark reviewed" pendingLabel="Saving" savedMessage="Marked as reviewed">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">The rejection stands. It leaves the count in the menu and any review request is closed.</p>
        <TextAreaField name="note" label="Note" rows={3} helper="Optional. At least 5 characters when given." />
      </FormGroup>
    </ActionForm>
  );
}

export interface CorrectableLead {
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectLinkedinUrl: string;
  readonly prospectEmail: string;
  readonly prospectPhone: string | null;
  readonly prospectNotes: string | null;
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
}

const FIELDS: readonly { readonly name: keyof CorrectableLead; readonly label: string; readonly area?: boolean }[] = [
  { name: "prospectName", label: "Name" },
  { name: "prospectTitle", label: "Job title" },
  { name: "prospectCompany", label: "Company" },
  { name: "prospectDomain", label: "Website" },
  { name: "prospectEmail", label: "Email" },
  { name: "prospectPhone", label: "Phone" },
  { name: "prospectLinkedinUrl", label: "LinkedIn" },
  { name: "prospectNotes", label: "Notes from the sender", area: true },
  { name: "bantBudget", label: "Budget" },
  { name: "bantAuthority", label: "Authority" },
  { name: "bantNeed", label: "Need" },
  { name: "bantTimeline", label: "Timeline" },
];

/** Fynix corrects what the lead says. Only the fields that change are sent; each field carries what it held, so an untouched one is not a change. */
export function CorrectLeadForm({ leadId, lead }: { leadId: string; lead: CorrectableLead }) {
  return (
    <ActionForm action={correctLeadAction} submitLabel="Save corrections" pendingLabel="Saving" savedMessage="Lead corrected">
      <Hidden name="leadId" value={leadId} />
      {FIELDS.map((entry) => (
        <Hidden key={entry.name} name={`was_${entry.name}`} value={lead[entry.name] ?? ""} />
      ))}
      <FormGroup title="Prospect">
        {FIELDS.slice(0, 8).map((entry) => (entry.area ? <TextAreaField key={entry.name} name={entry.name} label={entry.label} rows={3} defaultValue={lead[entry.name] ?? ""} /> : <TextField key={entry.name} name={entry.name} label={entry.label} defaultValue={lead[entry.name] ?? ""} />))}
      </FormGroup>
      <FormGroup title="Qualification">
        {FIELDS.slice(8).map((entry) => (
          <TextField key={entry.name} name={entry.name} label={entry.label} defaultValue={lead[entry.name] ?? ""} />
        ))}
      </FormGroup>
      <FormGroup>
        <TextAreaField name="note" label="Why it is corrected" rows={3} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}

/** Fynix answers for the client: pick a time, reject before the meeting, or accept or reject after it. */
export function AnswerForClientForm({ leadId, stage, proposedTimes }: { leadId: string; stage: string; proposedTimes: readonly string[] }) {
  const options =
    stage === "awaiting_client"
      ? [
          { value: "pick_time", label: "Pick one of the proposed times" },
          { value: "reject_before", label: "Reject before the meeting" },
        ]
      : stage === "scheduled"
        ? [{ value: "reject_before", label: "Reject before the meeting" }]
        : [
            { value: "accept", label: "Accept the lead" },
            { value: "reject", label: "Reject the lead" },
          ];
  return (
    <ActionForm action={answerForClientAction} submitLabel="Answer for the client" pendingLabel="Saving" savedMessage="Answered for the client">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <Notice tone="amber" compact>
          The answer is recorded as Fynix&apos;s, not the client&apos;s, and the client and the sending team read your note.
        </Notice>
        <SelectField name="answer" label="Answer" options={options} defaultValue={options.length === 1 ? (options[0]?.value ?? "") : ""} placeholder="Choose an answer" />
        {stage === "awaiting_client" ? (
          <div className="flex flex-col gap-2">
            <p className="text-label font-semibold text-ink-muted">Time, when picking one</p>
            <TimeChoices name="selectedMeetingTime" times={proposedTimes} />
          </div>
        ) : null}
        <TextAreaField name="note" label="Note" rows={4} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}

/** Fynix marks a lead lost: it closes at zero and a booked meeting is cancelled. */
export function MarkLostForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={markLostAction} submitLabel="Mark lost" pendingLabel="Saving" savedMessage="Lead marked lost">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <Notice tone="amber" compact>
          The lead closes and counts as zero. A booked meeting is cancelled. This cannot be undone.
        </Notice>
        <TextAreaField name="note" label="Note" rows={4} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}

/** Fynix clears the flag on a lead that went beyond a share, so it counts like any other. */
export function ClearOverShareForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={clearOverShareAction} submitLabel="Clear the flag" pendingLabel="Saving" savedMessage="Flag cleared">
      <Hidden name="leadId" value={leadId} />
      <FormGroup>
        <p className="text-body text-ink-muted">The lead went beyond a share. Clearing the flag approves it. To refuse it, mark the lead lost instead.</p>
        <TextAreaField name="note" label="Note" rows={3} helper={NOTE_HELPER} />
      </FormGroup>
    </ActionForm>
  );
}
