"use client";

import { ActionForm } from "@/components/fynix/forms/action-form";
import { FormGroup, Hidden, SelectField, TextAreaField, TextField } from "@/components/fynix/forms/form-parts";
import { addExclusionAction } from "@/server/domain/exclusion-actions";

const KINDS = [
  { value: "domain", label: "A website domain" },
  { value: "company", label: "A company name" },
] as const;

/** Adds a prospect rule to the client's exclusion list: a domain or a company name. Agencies are refused a lead that matches. */
export function AddExclusionForm({ clientOrgId }: { clientOrgId: string }) {
  return (
    <ActionForm action={addExclusionAction} submitLabel="Add to the list" pendingLabel="Adding" savedMessage="Added to the exclusion list">
      <Hidden name="clientOrgId" value={clientOrgId} />
      <FormGroup>
        <p className="text-body text-ink-muted">A lead for a company on this list is refused when an agency sends it. Use it for current customers, competitors and anyone you do not want contacted.</p>
        <SelectField name="kind" label="What to exclude" options={KINDS} defaultValue="domain" />
        <TextField name="value" label="Domain or company name" helper="For a domain, write it as example.com." />
        <TextAreaField name="reason" label="Reason" rows={2} helper="Optional. Only your team reads it." />
      </FormGroup>
    </ActionForm>
  );
}
