"use client";

import type { OrganisationContact } from "@/server/domain/organisations";
import { updateContactAction } from "@/server/fynix/actions";
import { SHOW_ALL, type ContactVisibility } from "../records/contact-visibility";
import { ActionForm } from "./action-form";
import { FormGroup, Hidden, TextAreaField, TextField } from "./form-parts";

const NO_CONTACT: OrganisationContact = { contactName: null, contactEmail: null, contactPhone: null, website: null, address: null, notes: null };

/** The contact fields a record asks for, shared by Add client and Edit contact. Every one is optional. The notes stay inside Fynix. */
export function ContactFields({ contact = NO_CONTACT, title = "Contact (optional)", show = SHOW_ALL }: { contact?: OrganisationContact; title?: string; show?: ContactVisibility }) {
  return (
    <FormGroup title={title}>
      {show.name ? <TextField name="contactName" label="Contact name" defaultValue={contact.contactName ?? ""} helper="The person Fynix speaks to." /> : null}
      {show.email ? <TextField name="contactEmail" label="Email" type="email" inputMode="email" defaultValue={contact.contactEmail ?? ""} /> : null}
      {show.phone ? <TextField name="contactPhone" label="Phone" defaultValue={contact.contactPhone ?? ""} /> : null}
      {show.website ? <TextField name="website" label="Website" defaultValue={contact.website ?? ""} helper="Starts with https://" /> : null}
      {show.address ? <TextAreaField name="address" label="Address" defaultValue={contact.address ?? ""} /> : null}
      <TextAreaField name="notes" label="Notes" defaultValue={contact.notes ?? ""} helper="Internal. Only the Fynix team reads these, never the company or anyone else." />
    </FormGroup>
  );
}

/** Edits the contact details of a client, a coordinator or a partner agency. A field left empty is cleared. */
export function EditContactForm({ organisationId, contact, show = SHOW_ALL }: { organisationId: string; contact: OrganisationContact; show?: ContactVisibility }) {
  return (
    <ActionForm action={updateContactAction} submitLabel="Save contact" pendingLabel="Saving">
      <Hidden name="organisationId" value={organisationId} />
      <ContactFields contact={contact} title="Contact details" show={show} />
    </ActionForm>
  );
}
