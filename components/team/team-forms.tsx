"use client";

import { addPartnerAgencyAction } from "@/server/domain/team-actions";
import { ActionForm } from "@/components/fynix/forms/action-form";
import { FormGroup, TextField } from "@/components/fynix/forms/form-parts";

/** A coordinator manager adds a partner agency under their own coordinator. Its people are invited from the Team page next. */
export function AddPartnerAgencyForm() {
  return (
    <ActionForm action={addPartnerAgencyAction} submitLabel="Add agency" pendingLabel="Adding">
      <FormGroup>
        <TextField name="name" label="Agency name" helper="The partner agency's company name. You can invite its people next." />
      </FormGroup>
    </ActionForm>
  );
}
