"use client";

import { useId, useState } from "react";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/fynix/form-state";
import { addAgencyAction, addCoordinatorAction, invitePersonAction, updateOrganisationAction } from "@/server/fynix/actions";
import { ActionForm, type PageMode } from "./action-form";
import { ConfirmField, FormGroup, Hidden, SelectField, TextField, TimeZoneField } from "./form-parts";

/** Adds a coordinator: one person, with a name, an email and a phone number. They are invited by email to sign in. A coordinator of the same name needs a tick. */
export function AddCoordinatorForm({ page }: { page?: PageMode }) {
  return (
    <ActionForm action={addCoordinatorAction} submitLabel="Add coordinator" pendingLabel="Adding" page={page}>
      <FormGroup>
        <TextField name="name" label="Name" autoComplete="off" helper="The coordinator's full name." />
        <TextField name="email" label="Email" type="email" inputMode="email" helper="The invite to sign in goes here. It works for 7 days." />
        <TextField name="phone" label="Phone" />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
      </FormGroup>
    </ActionForm>
  );
}

/**
 * Adds a partner agency under a coordinator: one person, with a name, an email and a phone number, invited by email to sign in. Opened inside a
 * coordinator it takes that coordinator (`coordinatorId`, hidden); opened from the Agencies page it asks for one from `coordinators`.
 */
export function AddAgencyForm({ coordinatorId, coordinators = [], page }: { coordinatorId?: string; coordinators?: readonly { readonly id: string; readonly name: string }[]; page?: PageMode }) {
  return (
    <ActionForm action={addAgencyAction} submitLabel="Add agency" pendingLabel="Adding" page={page}>
      {coordinatorId === undefined ? null : <Hidden name="coordinatorId" value={coordinatorId} />}
      <FormGroup>
        {coordinatorId === undefined ? (
          <SelectField name="coordinatorId" label="Coordinator" options={coordinators.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose a coordinator" helper="The agency works under this coordinator." />
        ) : null}
        <TextField name="name" label="Name" autoComplete="off" helper="The agency's full name." />
        <TextField name="email" label="Email" type="email" inputMode="email" helper="The invite to sign in goes here. It works for 7 days." />
        <TextField name="phone" label="Phone" />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
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

/** A contact person as the invite form starts from them. */
type ContactToInvite = { readonly id: string; readonly name: string; readonly jobTitle: string | null; readonly email: string | null; readonly phone: string | null };

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
  page,
  contacts = [],
}: {
  organisations: readonly { readonly id: string; readonly name: string }[];
  roles?: readonly RoleOption[];
  showAlias?: boolean;
  roleHelper?: string;
  /** The Fynix action unless a portal passes its own. */
  action?: (previous: FormState, formData: FormData) => Promise<FormState>;
  page?: PageMode;
  /** A client's contact people: choosing one fills in the name, job title, email and phone below, so they are not typed twice. */
  contacts?: readonly ContactToInvite[];
}) {
  const [only] = organisations;
  const [from, setFrom] = useState<ContactToInvite | null>(null);
  const pickerId = useId();
  return (
    <ActionForm action={action} submitLabel="Send invite" pendingLabel="Sending" page={page}>
      {organisations.length === 1 && only !== undefined ? (
        <Hidden name="organisationId" value={only.id} />
      ) : (
        <FormGroup title="Where they work">
          <SelectField name="organisationId" label="Works at" options={organisations.map((row) => ({ value: row.id, label: row.name }))} defaultValue={only?.id} />
        </FormGroup>
      )}
      {contacts.length > 0 ? (
        <FormGroup title="Start from a contact person">
          <Field id={pickerId} label="Contact person" helper="Fills in the details below. Nothing is sent until you send the invite.">
            <Choice id={pickerId} value={from?.id ?? ""} onValueChange={(next) => setFrom(contacts.find((row) => row.id === next) ?? null)} options={contacts.map((row) => ({ value: row.id, label: row.jobTitle === null ? row.name : `${row.name}, ${row.jobTitle}` }))} placeholder="Choose a contact person" />
          </Field>
        </FormGroup>
      ) : null}
      <FormGroup title="The person" key={from?.id ?? "blank"}>
        <TextField name="name" label="Full name" autoComplete="off" defaultValue={from?.name ?? ""} />
        <TextField name="jobTitle" label="Job title" autoComplete="off" defaultValue={from?.jobTitle ?? ""} />
        <TextField name="email" label="Email" type="email" inputMode="email" defaultValue={from?.email ?? ""} helper="The invite link goes here. It works for 7 days." />
        <TextField name="phone" label="Phone (optional)" defaultValue={from?.phone ?? ""} />
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
        <TimeZoneField defaultValue={timeZone ?? ""} helper="For example Europe/London. Search, or type Area/City. Leave it empty if not known." />
      </FormGroup>
    </ActionForm>
  );
}
