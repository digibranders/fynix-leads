/**
 * Keeps what a person typed when a form action ends. React clears every uncontrolled field once an action finishes, even when it failed or only saved a draft,
 * so the lead form remembers the text fields at the moment of sending and puts them back. Only plain text-like fields are kept: hidden fields belong to React.
 */
const KEPT_TYPES = new Set(["text", "email", "url", "tel", "search", "number"]);

export type FieldValues = Readonly<Record<string, string>>;

/** The text of every text-like field in a form, by name, from what is about to be sent. */
export function textValues(form: { readonly elements: ArrayLike<unknown> }): FieldValues {
  const values: Record<string, string> = {};
  for (const element of Array.from(form.elements)) {
    const field = element as { name?: string; type?: string; value?: string; tagName?: string };
    if (typeof field.name !== "string" || field.name === "" || typeof field.value !== "string") continue;
    if (field.tagName === "TEXTAREA" || (field.type !== undefined && KEPT_TYPES.has(field.type))) values[field.name] = field.value;
  }
  return values;
}

/** Puts the kept text back into the fields of the same names. A field that is not there, or is not text, is left alone. */
export function restoreTextValues(form: { readonly elements: ArrayLike<unknown> }, values: FieldValues): void {
  for (const element of Array.from(form.elements)) {
    const field = element as { name?: string; type?: string; value?: string; tagName?: string };
    if (typeof field.name !== "string" || !(field.name in values) || typeof field.value !== "string") continue;
    if (field.tagName === "TEXTAREA" || (field.type !== undefined && KEPT_TYPES.has(field.type))) field.value = values[field.name] ?? "";
  }
}
