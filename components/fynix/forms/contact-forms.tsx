"use client";

import type { OrganisationContact } from "@/server/domain/organisations";
import { updateContactAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { FormGroup, Hidden, TextAreaField, TextField } from "./form-parts";

const NO_CONTACT: OrganisationContact = { contactName: null, contactEmail: null, contactPhone: null, website: null, address: null, notes: null };

/** The company contact fields, shared by Add client, Add coordinator, Add agency and Edit contact. Every one is optional. The notes stay inside Fynix. */
export function ContactFields({ contact = NO_CONTACT, title = "Contact (optional)" }: { contact?: OrganisationContact; title?: string }) {
  return (
    <FormGroup title={title}>
      <TextField name="contactName" label="Contact name" defaultValue={contact.contactName ?? ""} helper="The person Fynix speaks to at the company." />
      <TextField name="contactEmail" label="Contact email" type="email" inputMode="email" defaultValue={contact.contactEmail ?? ""} />
      <TextField name="contactPhone" label="Contact phone" defaultValue={contact.contactPhone ?? ""} />
      <TextField name="website" label="Website" defaultValue={contact.website ?? ""} helper="Starts with https://" />
      <TextAreaField name="address" label="Address" defaultValue={contact.address ?? ""} rows={3} />
      <TextAreaField name="notes" label="Notes" defaultValue={contact.notes ?? ""} rows={4} helper="Internal. Only the Fynix team reads these, never the company or anyone else." />
    </FormGroup>
  );
}

/** Edits the contact details of a client, a coordinator or a partner agency. A field left empty is cleared. */
export function EditContactForm({ organisationId, contact }: { organisationId: string; contact: OrganisationContact }) {
  return (
    <ActionForm action={updateContactAction} submitLabel="Save contact" pendingLabel="Saving">
      <Hidden name="organisationId" value={organisationId} />
      <ContactFields contact={contact} title="Contact details" />
    </ActionForm>
  );
}
