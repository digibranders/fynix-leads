"use client";

import type { FormState } from "@/lib/fynix/form-state";
import { updatePersonAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { FormGroup, Hidden, TextField } from "./form-parts";

/** Changes a person's name, job title and phone. A blank phone clears it. `action` is the Fynix one unless a portal passes its own. */
export function EditPersonForm({ memberId, name, jobTitle, phone, action = updatePersonAction }: { memberId: string; name: string; jobTitle: string | null; phone: string | null; action?: (previous: FormState, formData: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Save changes" pendingLabel="Saving">
      <Hidden name="memberId" value={memberId} />
      <FormGroup>
        <TextField name="displayName" label="Full name" defaultValue={name} />
        <TextField name="jobTitle" label="Job title" defaultValue={jobTitle ?? ""} />
        <TextField name="phone" label="Phone (optional)" defaultValue={phone ?? ""} />
      </FormGroup>
    </ActionForm>
  );
}
