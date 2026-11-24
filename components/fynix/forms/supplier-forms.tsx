"use client";

import type { FormState } from "@/lib/fynix/form-state";
import { addAgencyAction, addSupplierAction, invitePersonAction, updateOrganisationAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { FormGroup, Hidden, SelectField, TextField } from "./form-parts";

export function AddSupplierForm() {
  return (
    <ActionForm action={addSupplierAction} submitLabel="Add coordinator" pendingLabel="Adding">
      <FormGroup>
        <TextField name="name" label="Coordinator name" helper="The company name. You can invite its people next." />
      </FormGroup>
    </ActionForm>
  );
}

export function AddAgencyForm({ supplierId }: { supplierId: string }) {
  return (
    <ActionForm action={addAgencyAction} submitLabel="Add agency" pendingLabel="Adding">
      <Hidden name="supplierId" value={supplierId} />
      <FormGroup>
        <TextField name="name" label="Agency name" helper="The partner agency's company name." />
      </FormGroup>
    </ActionForm>
  );
}

const ROLES = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
] as const;

/** The two roles of a Fynix person: an admin changes set-up, staff read it and work leads. */
export const FYNIX_ROLES = [
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Admin" },
] as const;

type RoleOption = { readonly value: string; readonly label: string };

/**
 * Invites a person into a client, a coordinator or one of its partner agencies, or into Fynix. A client or Fynix person needs no alias; an
 * agency person's alias is optional and shown only where it can apply (`showAlias`).
 */
export function InvitePersonForm({
  organisations,
  roles = ROLES,
  showAlias = true,
  roleHelper = "A manager can accept agreements and invite colleagues.",
  action = invitePersonAction,
}: {
  organisations: readonly { readonly id: string; readonly name: string }[];
  roles?: readonly RoleOption[];
  showAlias?: boolean;
  roleHelper?: string;
  /** The Fynix action unless a portal passes its own. */
  action?: (previous: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [only] = organisations;
  return (
    <ActionForm action={action} submitLabel="Send invite" pendingLabel="Sending">
      {organisations.length === 1 && only !== undefined ? (
        <Hidden name="organisationId" value={only.id} />
      ) : (
        <FormGroup title="Where they work">
          <SelectField name="organisationId" label="Works at" options={organisations.map((row) => ({ value: row.id, label: row.name }))} defaultValue={only?.id} />
        </FormGroup>
      )}
      <FormGroup title="The person">
        <TextField name="name" label="Full name" autoComplete="off" />
        <TextField name="jobTitle" label="Job title" autoComplete="off" />
        <TextField name="email" label="Email" type="email" inputMode="email" helper="The invite link goes here. It works for 7 days." />
        <TextField name="phone" label="Phone (optional)" />
        <SelectField name="role" label="Role" options={roles} defaultValue={roles[0]?.value} helper={roleHelper} />
      </FormGroup>
      {showAlias && (
        <FormGroup title="What the client sees">
          <TextField name="alias" label="Name the client sees (optional)" helper="Only for people at an agency. It defaults to their own name." />
        </FormGroup>
      )}
    </ActionForm>
  );
}

/** Renames a client or a coordinator and sets its time zone. */
export function EditOrganisationForm({ organisationId, name, timeZone, label }: { organisationId: string; name: string; timeZone: string | null; label: string }) {
  return (
    <ActionForm action={updateOrganisationAction} submitLabel="Save changes" pendingLabel="Saving">
      <Hidden name="organisationId" value={organisationId} />
      <FormGroup>
        <TextField name="name" label={`${label} name`} defaultValue={name} />
        <TextField name="timeZone" label="Time zone" defaultValue={timeZone ?? ""} helper="For example Europe/London. Leave it empty if not known." />
      </FormGroup>
    </ActionForm>
  );
}
