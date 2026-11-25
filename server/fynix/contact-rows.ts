import { issueSentence, type FormValues } from "@/lib/fynix/form-state";
import { contactPersonSchema, MAX_NEW_CONTACTS } from "@/server/domain/inputs";

/**
 * The contact people on the Add client page: up to `MAX_NEW_CONTACTS` rows, each posted as `contact<N>Name`, `contact<N>Email` and
 * `contact<N>Phone`. The page shows only the rows the person added, so the numbers may skip; a row with nothing in it is ignored.
 */
const ROW_KEYS = [
  { key: "name", suffix: "Name", label: "Name" },
  { key: "email", suffix: "Email", label: "Email" },
  { key: "phone", suffix: "Phone", label: "Phone" },
] as const;

const fieldName = (row: number, suffix: string) => `contact${row}${suffix}`;

/** Every form field a row may post, so a failed attempt can give back what was typed. */
export const CONTACT_ROW_FIELDS: readonly string[] = Array.from({ length: MAX_NEW_CONTACTS }, (_, row) => ROW_KEYS.map((entry) => fieldName(row, entry.suffix))).flat();

interface TypedRow {
  readonly row: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

function typedRows(get: (name: string) => string): readonly TypedRow[] {
  const rows: TypedRow[] = [];
  for (let row = 0; row < MAX_NEW_CONTACTS; row += 1) {
    const typed = { row, name: get(fieldName(row, "Name")).trim(), email: get(fieldName(row, "Email")).trim(), phone: get(fieldName(row, "Phone")).trim() };
    if (typed.name !== "" || typed.email !== "" || typed.phone !== "") rows.push(typed);
  }
  return rows;
}

/** The people to add: the rows with something in them, with a blank email or phone left out. */
export function contactRowsBody(get: (name: string) => string): readonly { readonly name: string; readonly email?: string; readonly phone?: string }[] {
  return typedRows(get).map(({ name, email, phone }) => ({ name, ...(email === "" ? {} : { email }), ...(phone === "" ? {} : { phone }) }));
}

/** A sentence under the box of each row that is not valid, so one bad row does not hide the others. */
export function contactRowProblems(get: (name: string) => string): FormValues {
  const found: Record<string, string> = {};
  for (const typed of typedRows(get)) {
    const checked = contactPersonSchema.safeParse(contactRowsBody((name) => (name.startsWith(`contact${typed.row}`) ? get(name) : ""))[0]);
    if (checked.success) continue;
    for (const issue of checked.error.issues) {
      const entry = ROW_KEYS.find((candidate) => candidate.key === issue.path[0]);
      if (entry === undefined) continue;
      const key = fieldName(typed.row, entry.suffix);
      if (found[key] === undefined) found[key] = issueSentence(entry.label, issue);
    }
  }
  return found;
}
