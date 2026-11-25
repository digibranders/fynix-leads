/** The form fields of the "Contact (optional)" group on Add client, Add coordinator, Add agency and Edit contact. They are also the schema keys. */
export const CONTACT_FIELDS = ["contactName", "contactEmail", "contactPhone", "website", "address", "notes"] as const;

export const CONTACT_LABELS = {
  contactName: "Contact name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  website: "Website",
  address: "Address",
  notes: "Notes",
} as const;

/** For a new company: the fields that were filled in, trimmed. A blank field is left out, so the schema never sees an empty string. */
export function contactCreateBody(get: (name: string) => string): Record<string, string> {
  return Object.fromEntries(CONTACT_FIELDS.flatMap((name) => (get(name).trim() === "" ? [] : [[name, get(name).trim()]])));
}

/** For an existing company: every field, trimmed, and a blank one is `null` so it is cleared. */
export function contactUpdateBody(get: (name: string) => string): Record<string, string | null> {
  return Object.fromEntries(CONTACT_FIELDS.map((name) => [name, get(name).trim() === "" ? null : get(name).trim()]));
}
