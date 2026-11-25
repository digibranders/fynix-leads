import type { OrganisationContact } from "@/server/domain/organisations";

/** Which of the contact boxes a record shows. Notes always show. */
export interface ContactVisibility {
  readonly name: boolean;
  readonly email: boolean;
  readonly phone: boolean;
  readonly website: boolean;
  readonly address: boolean;
}

export const SHOW_ALL: ContactVisibility = { name: true, email: true, phone: true, website: true, address: true };

/**
 * What a record asks for and shows, so a screen carries only the details its kind of record needs. A detail that is stored always shows, so
 * nothing taken earlier is hidden or cleared by an edit.
 * - `client`: the company's website. Its people are the contact people in their own panel.
 * - `person`: a coordinator or an agency is one person, so their email and phone.
 */
export function contactVisibility(contact: OrganisationContact, mode: "client" | "person" | undefined): ContactVisibility {
  if (mode === undefined) return SHOW_ALL;
  const stored = (value: string | null): boolean => value !== null;
  return mode === "client"
    ? { name: stored(contact.contactName), email: stored(contact.contactEmail), phone: stored(contact.contactPhone), website: true, address: stored(contact.address) }
    : { name: stored(contact.contactName), email: true, phone: true, website: stored(contact.website), address: stored(contact.address) };
}
