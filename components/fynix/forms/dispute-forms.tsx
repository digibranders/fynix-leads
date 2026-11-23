"use client";

import { resolveDisputeAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { Hidden, SelectField, TextAreaField } from "./form-parts";

const DECISIONS = [
  { value: "rejected", label: "Dispute rejected: the lead stays delivered" },
  { value: "upheld", label: "Dispute upheld: the lead is rejected" },
] as const;

/** Fynix's decision on one disputed lead. An upheld dispute removes the lead from the count. */
export function ResolveDisputeForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={resolveDisputeAction} submitLabel="Record decision" pendingLabel="Saving">
      <Hidden name="leadId" value={leadId} />
      <SelectField name="resolution" label="Decision" options={DECISIONS} placeholder="Choose a decision" />
      <TextAreaField name="note" label="Note" rows={3} helper="Optional. Kept in the lead's history." />
    </ActionForm>
  );
}
