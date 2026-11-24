"use client";

import { publishTermsAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { FormGroup, SelectField, TextAreaField, TextField } from "./form-parts";

const PARTIES = [
  { value: "client", label: "Clients" },
  { value: "agency", label: "Coordinators and agencies" },
  { value: "fynix", label: "Fynix team" },
] as const;

/** Publishes a new version of the terms for one side. The version in force is replaced, never edited. */
export function PublishTermsForm() {
  return (
    <ActionForm action={publishTermsAction} submitLabel="Publish terms" pendingLabel="Publishing" savedMessage="Terms published">
      <FormGroup title="Who accepts them">
        <SelectField name="party" label="Side" options={PARTIES} placeholder="Choose a side" helper="The new version replaces the one in force for that side." />
      </FormGroup>
      <FormGroup title="The terms">
        <TextField name="title" label="Title" helper="For example: Terms for clients." />
        <TextAreaField name="body" label="Text" rows={16} helper="Paste the full approved text. A published version cannot be edited. To change it, publish another." />
      </FormGroup>
    </ActionForm>
  );
}
