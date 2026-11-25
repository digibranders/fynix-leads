import type { z } from "zod";

/** What a Fynix admin form's server action hands back to its form through `useActionState`. Plain data only. */
export type FormValues = Readonly<Record<string, string>>;

export type FormState =
  | { readonly status: "idle" }
  /** `message` is a problem with the whole form, `fields` a sentence per field, `values` what was typed so a failed attempt keeps it. */
  | { readonly status: "error"; readonly message: string | null; readonly fields: FormValues; readonly values: FormValues }
  /** The change is saved. `redirectTo` is a page to move to, for example the coordinator that was just added. `notice` is a plain sentence about a part that did not go through (an invite that was refused), shown instead of "Saved". */
  | { readonly status: "done"; readonly redirectTo: string | null; readonly notice?: string | null };

export const IDLE_FORM: FormState = { status: "idle" };

/** The parts of a zod issue the sentences use. Every zod issue has this shape. */
interface Issue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly origin?: string;
  readonly minimum?: number | bigint;
  readonly maximum?: number | bigint;
  readonly format?: string;
  readonly expected?: string;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One plain sentence for one issue, built from the field's label and never from what was typed. */
export function issueSentence(label: string, issue: Issue): string {
  const { message } = issue;
  if (message.startsWith("is ") || message.startsWith("must ")) return `${label} ${message}.`;
  if (issue.code === "invalid_type") return message.includes("undefined") ? `${label} is required.` : `${label} must be a whole number.`;
  if (issue.code === "too_small" && issue.origin === "number") return `${label} must be at least ${String(issue.minimum)}.`;
  if (issue.code === "too_big" && issue.origin === "number") return `${label} must be at most ${String(issue.maximum)}.`;
  if (issue.code === "invalid_format" && issue.format === "email") return "Enter a valid email address.";
  if (issue.code === "invalid_format" && issue.format === "uuid") return `Choose an option for ${label.toLowerCase()}.`;
  return `${label} is not valid.`;
}

/**
 * The first sentence for each field of the form. A zod path starts with the schema key; `labels` names the fields the person
 * sees, `rename` maps a schema key to the name of the form field that carries it, and a key without a label falls back to the key itself.
 */
export function fieldErrors(error: z.ZodError, labels: Readonly<Record<string, string>>, rename: Readonly<Record<string, string>> = {}): FormValues {
  const found: Record<string, string> = {};
  for (const issue of error.issues) {
    const schemaKey = String(issue.path[0] ?? "");
    const key = rename[schemaKey] ?? schemaKey;
    if (key !== "" && found[key] === undefined) found[key] = issueSentence(labels[schemaKey] ?? capitalise(schemaKey), issue);
  }
  return found;
}
