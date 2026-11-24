"use client";

import { addAgencyAction, addClientAction, addSupplierAction, invitePersonAction } from "@/server/fynix/actions";
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

/** Invites a person into the supplier or one of its partner agencies. An agency person gets the Fynix name the client sees instead of their own. */
export function InvitePersonForm({ organisations }: { organisations: readonly { readonly id: string; readonly name: string }[] }) {
  const [only] = organisations;
  return (
    <ActionForm action={invitePersonAction} submitLabel="Send invite" pendingLabel="Sending">
      {organisations.length === 1 && only !== undefined ? (
        <Hidden name="organisationId" value={only.id} />
      ) : (
        <FormGroup title="Where they work">
          <SelectField name="organisationId" label="Works at" options={organisations.map((row) => ({ value: row.id, label: row.name }))} defaultValue={only?.id} />
        </FormGroup>
      )}
      <FormGroup title="The person">
        <TextField name="name" label="Full name" autoComplete="off" />
        <TextField name="email" label="Email" type="email" inputMode="email" helper="The invite link goes here. It works for 7 days." />
        <SelectField name="role" label="Role" options={ROLES} defaultValue="member" helper="A manager can accept agreements for the coordinator." />
      </FormGroup>
      <FormGroup title="What the client sees">
        <TextField name="alias" label="Fynix name" helper="What the client sees instead of their real name, for example Asha, Fynix." />
      </FormGroup>
    </ActionForm>
  );
}

export function AddClientForm() {
  return (
    <ActionForm action={addClientAction} submitLabel="Add client" pendingLabel="Adding">
      <FormGroup>
        <TextField name="name" label="Client name" helper="The company name. Only Fynix and the client see it." />
        <TextField name="brandName" label="Brand name" helper="What agencies see in place of the client's name." />
      </FormGroup>
    </ActionForm>
  );
}
