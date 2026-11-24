export const AUDIT_PAGE_SIZE = 50;

/** What the audit log screen filters by, read from the address. Every part is optional and a value that is not valid is dropped, never trusted. */
export interface AuditFilter {
  /** The part of an action before the dot (`lead`, `campaign`), or empty for every action. */
  readonly prefix: string;
  /** The start of a subject reference (`CMP-7Q2X`), or empty. */
  readonly subject: string;
  /** The account that made the change, or empty. */
  readonly person: string;
  /** A word to find in the action, its wording, the reference or the person's name. */
  readonly q: string;
  /** 1-based. */
  readonly page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined): string => (typeof value === "string" ? value : "");

export function parseAuditFilter(params: Readonly<Record<string, string | string[] | undefined>>): AuditFilter {
  const prefix = one(params.action).trim();
  const person = one(params.person).trim();
  const page = Number(one(params.page));
  return {
    prefix: /^[a-z_]{1,40}$/.test(prefix) ? prefix : "",
    subject: one(params.subject).trim().slice(0, 40),
    person: UUID.test(person) ? person.toLowerCase() : "",
    q: one(params.q).trim().slice(0, 80),
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

/** The address of the screen for a filter, leaving out every empty part, so a link keeps what the person chose. */
export function auditHref(base: string, filter: Partial<AuditFilter>): string {
  const query = new URLSearchParams();
  if (filter.prefix) query.set("action", filter.prefix);
  if (filter.subject) query.set("subject", filter.subject);
  if (filter.person) query.set("person", filter.person);
  if (filter.q) query.set("q", filter.q);
  if (filter.page !== undefined && filter.page > 1) query.set("page", String(filter.page));
  const text = query.toString();
  return text === "" ? base : `${base}?${text}`;
}

/** `%`, `_` and the escape character mean something to LIKE, and action names are full of underscores, so a typed word is escaped before it is matched. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
