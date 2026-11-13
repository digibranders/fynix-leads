"use client";

import { addAgencyAction, addSupplierAction, invitePersonAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { Hidden, SelectField, TextField } from "./form-parts";

export function AddSupplierForm() {
  return (
    <ActionForm action={addSupplierAction} submitLabel="Add supplier" pendingLabel="Adding">
      <TextField name="name" label="Supplier name" helper="The company name. You can invite its people next." />
    </ActionForm>
  );
}

export function AddAgencyForm({ supplierId }: { supplierId: string }) {
  return (
    <ActionForm action={addAgencyAction} submitLabel="Add agency" pendingLabel="Adding">
      <Hidden name="supplierId" value={supplierId} />
      <TextField name="name" label="Agency name" helper="The partner agency's company name." />
    </ActionForm>
  );
}

const ROLES = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
] as const;

/** Invites a person into the supplier or one of its partner agencies. An agency person gets the Fynix name the client sees instead of their own. */
export function InvitePersonForm({ organisations }: { organisations: readonly { readonly id: string; readonly name: string }[] }) {
  const [only] = organisations;
  return (
    <ActionForm action={invitePersonAction} submitLabel="Send invite" pendingLabel="Sending">
      {organisations.length === 1 && only !== undefined ? (
        <Hidden name="organisationId" value={only.id} />
      ) : (
        <SelectField name="organisationId" label="Works at" options={organisations.map((row) => ({ value: row.id, label: row.name }))} defaultValue={only?.id} />
      )}
      <TextField name="name" label="Full name" autoComplete="off" />
      <TextField name="email" label="Email" type="email" inputMode="email" helper="The invite link goes here. It works for 7 days." />
      <SelectField name="role" label="Role" options={ROLES} defaultValue="member" helper="A manager can accept agreements for the supplier." />
      <TextField name="alias" label="Fynix name" helper="What the client sees instead of their real name, for example Asha, Fynix." />
    </ActionForm>
  );
}
