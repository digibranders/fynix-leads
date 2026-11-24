"use client";

import { ActionForm } from "@/components/fynix/forms/action-form";
import { FormGroup, SelectField, TextField } from "@/components/fynix/forms/form-parts";
import { addClientHostAction } from "@/server/domain/team-actions";

/** A client manager picks a campaign and one of the organisation's people to take its meetings. A person who was paused comes back with the title given here. */
export function AddHostForm({ campaigns, people }: { readonly campaigns: readonly { readonly id: string; readonly name: string }[]; readonly people: readonly { readonly memberId: string; readonly name: string }[] }) {
  return (
    <ActionForm action={addClientHostAction} submitLabel="Add host" pendingLabel="Adding" savedMessage="Host added">
      <FormGroup>
        <SelectField name="campaignId" label="Campaign" options={campaigns.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose a campaign" />
        <SelectField name="memberId" label="Person" options={people.map((row) => ({ value: row.memberId, label: row.name }))} placeholder="Choose a person" helper="Only active people of your organisation can take meetings." />
        <TextField name="jobTitle" label="Job title" helper="What the coordinator is told this person does, for example Head of FP&A." />
      </FormGroup>
    </ActionForm>
  );
}
