"use client";

import type { FormState } from "@/lib/fynix/form-state";
import { addAgencyAction, addSupplierAction, invitePersonAction, updateOrganisationAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { ContactFields } from "./contact-forms";
import { ConfirmField, FormGroup, Hidden, SelectField, TextField, TimeZoneField } from "./form-parts";

const FIRST_PERSON_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
] as const;

/** The optional first person of a new coordinator or agency: invited in the same step. Left empty, nothing is sent. */
function FirstPersonFields({ roleHelper }: { roleHelper: string }) {
  return (
    <FormGroup title="First person (optional)">
      <p className="text-xs text-muted-foreground">Invite someone now, or leave this empty and invite people later. The invite link goes by email and works for 7 days.</p>
      <TextField name="firstName" label="Full name" autoComplete="off" />
      <TextField name="firstJobTitle" label="Job title" autoComplete="off" />
      <TextField name="firstEmail" label="Email" type="email" inputMode="email" helper="The invite link goes here." />
      <TextField name="firstPhone" label="Phone (optional)" />
      <SelectField name="firstRole" label="Role" options={FIRST_PERSON_ROLES} defaultValue="manager" helper={roleHelper} />
    </FormGroup>
  );
}

/** Adds a coordinator and, if given, invites its first person. A coordinator of the same name needs a tick. */
export function AddSupplierForm() {
  return (
    <ActionForm action={addSupplierAction} submitLabel="Add coordinator" pendingLabel="Adding">
      <FormGroup>
        <TextField name="name" label="Coordinator name" helper="A coordinator is an agency that works with Fynix directly. Use the company name." />
        <TimeZoneField helper="Where the coordinator works, for example Europe/London. Start typing to pick one. Used when showing times for them. Optional." />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
      </FormGroup>
      <ContactFields />
      <FirstPersonFields roleHelper="A manager can invite their own people and partner agencies. A member cannot." />
    </ActionForm>
  );
}

/**
 * Adds a partner agency under a coordinator and, if given, invites its first person. Opened inside a coordinator it takes that coordinator
 * (`supplierId`, hidden); opened from the Agencies page it asks for one from `coordinators`.
 */
export function AddAgencyForm({ supplierId, coordinators = [] }: { supplierId?: string; coordinators?: readonly { readonly id: string; readonly name: string }[] }) {
  return (
    <ActionForm action={addAgencyAction} submitLabel="Add agency" pendingLabel="Adding">
      {supplierId === undefined ? null : <Hidden name="supplierId" value={supplierId} />}
      <FormGroup>
        {supplierId === undefined ? (
          <SelectField name="supplierId" label="Coordinator" options={coordinators.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose a coordinator" helper="The agency works under this coordinator." />
        ) : null}
        <TextField name="name" label="Agency name" helper={supplierId === undefined ? "The partner agency's company name." : "A partner agency works under this coordinator. Use the company name."} />
        <TimeZoneField helper="Where the agency works, for example Europe/London. Start typing to pick one. Optional." />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
      </FormGroup>
      <ContactFields />
      <FirstPersonFields roleHelper="A manager can invite colleagues. A member cannot." />
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
        <TimeZoneField defaultValue={timeZone ?? ""} helper="For example Europe/London. Start typing to pick one. Leave it empty if not known." />
      </FormGroup>
    </ActionForm>
  );
}
