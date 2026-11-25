"use client";

import { addClientAction } from "@/server/fynix/actions";
import { ActionForm, type PageMode } from "./action-form";
import { ContactPeopleFields } from "./contact-person-forms";
import { ConfirmField, FormGroup, TextField } from "./form-parts";

/** Adds a client: its name and website, and as many contact people as it takes. The rest is given with the campaign. A second client of the same name needs a tick. */
export function AddClientForm({ page }: { page?: PageMode }) {
  return (
    <ActionForm action={addClientAction} submitLabel="Add client" pendingLabel="Adding" page={page}>
      <FormGroup title="Client">
        <TextField name="name" label="Client name" helper="The company name. Agencies see it only on campaigns they work on." />
        <TextField name="website" label="Website" helper="Starts with https://" />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
      </FormGroup>
      <ContactPeopleFields />
    </ActionForm>
  );
}
