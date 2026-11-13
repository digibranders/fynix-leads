"use client";

import { addHostAction, publishAgreementAction, setShareAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { Hidden, NumberField, SelectField, TextAreaField, TextField } from "./form-parts";

type Defaults = {
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
};

/** Publishes the next version of one party's agreement. The numbers start from the version in force. */
export function NewAgreementForm({ campaignId, party, defaults }: { campaignId: string; party: "client" | "supplier"; defaults: Defaults | null }) {
  return (
    <ActionForm action={publishAgreementAction} submitLabel="Publish version" pendingLabel="Publishing">
      <Hidden name="campaignId" value={campaignId} />
      <Hidden name="party" value={party} />
      <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={defaults === null ? "" : String(defaults.monthlyTarget)} />
      <NumberField name="totalTarget" label="Meetings in total" defaultValue={defaults === null ? "" : String(defaults.totalTarget)} />
      <NumberField name="disputeWindowHours" label="Dispute window, in hours" defaultValue={String(defaults?.disputeWindowHours ?? 48)} helper="How long after a meeting the client may dispute it." />
      <TextAreaField name="rules" label="Counting rules" rows={4} defaultValue={defaults?.rules ?? ""} helper="When a meeting counts, including no-shows and late cancellations, in words." />
      <TextAreaField name="notes" label="Notes" rows={3} defaultValue={defaults?.notes ?? ""} />
    </ActionForm>
  );
}

type Option = { readonly id: string; readonly name: string };

/** Sets one agency's monthly share. Adding offers the agencies without a share; editing fixes the agency and starts from its current number. */
export function ShareForm({ campaignId, options, agency }: { campaignId: string; options: readonly Option[]; agency?: { readonly id: string; readonly name: string; readonly monthlyShare: number } }) {
  return (
    <ActionForm action={setShareAction} submitLabel={agency === undefined ? "Add share" : "Save share"} pendingLabel="Saving">
      <Hidden name="campaignId" value={campaignId} />
      {agency === undefined ? (
        <SelectField name="agencyOrgId" label="Agency" options={options.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose an agency" />
      ) : (
        <>
          <Hidden name="agencyOrgId" value={agency.id} />
          <p className="text-body text-ink-2">
            Share for <b className="font-semibold text-ink">{agency.name}</b>
          </p>
        </>
      )}
      <NumberField name="monthlyShare" label="Meetings per month" defaultValue={agency === undefined ? "" : String(agency.monthlyShare)} />
    </ActionForm>
  );
}

/** Adds a person at the client as a host of the campaign. A host who was paused comes back with the title given here. */
export function AddHostForm({ campaignId, candidates, clientName }: { campaignId: string; candidates: readonly { readonly memberId: string; readonly displayName: string }[]; clientName: string }) {
  return (
    <ActionForm action={addHostAction} submitLabel="Add host" pendingLabel="Adding">
      <Hidden name="campaignId" value={campaignId} />
      <SelectField name="memberId" label={`Person at ${clientName}`} options={candidates.map((row) => ({ value: row.memberId, label: row.displayName }))} placeholder="Choose a person" />
      <TextField name="jobTitle" label="Job title" helper="What the supplier is told this person does, for example Head of FP&A." />
    </ActionForm>
  );
}
