"use client";

import { useId, useState } from "react";
import { Choice } from "@/components/ui/choice";
import { DateField, TimeField } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tonal } from "@/components/kit/panel";
import { Textarea } from "@/components/ui/textarea";
import { useFormState } from "./action-form";

/** What a field shows: after a failed attempt, what was typed; otherwise the starting value. */
function useField(name: string, initial: string): { readonly value: string; readonly error: string | undefined } {
  const state = useFormState();
  if (state.status !== "error") return { value: initial, error: undefined };
  return { value: state.values[name] ?? initial, error: state.fields[name] };
}

type Common = { name: string; label: string; helper?: string; defaultValue?: string };

const ariaFor = (id: string, error: string | undefined, helper: string | undefined) => ({
  "aria-invalid": error === undefined ? undefined : (true as const),
  "aria-describedby": error !== undefined || helper !== undefined ? `${id}-message` : undefined,
});

/** A date or a time of day, with the app's own pickers; the value posts under `name` as the browser's boxes would post it. */
function PickerField({ id, name, label, helper, error, type, initial }: { id: string; name: string; label: string; helper: string | undefined; error: string | undefined; type: "date" | "time"; initial: string }) {
  const [value, setValue] = useState(initial);
  const aria = { invalid: error !== undefined, "aria-describedby": error !== undefined || helper !== undefined ? `${id}-message` : undefined };
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      {type === "date" ? <DateField id={id} name={name} value={value} onChange={setValue} {...aria} /> : <TimeField id={id} name={name} value={value} onChange={setValue} {...aria} />}
    </Field>
  );
}

export function TextField({
  name,
  label,
  helper,
  defaultValue = "",
  type = "text",
  inputMode,
  autoComplete = "off",
  placeholder,
}: Common & { type?: "text" | "email" | "time" | "date"; inputMode?: "text" | "email" | "numeric"; autoComplete?: string; placeholder?: string }) {
  const id = `${useId()}-${name}`;
  const { value, error } = useField(name, defaultValue);
  if (type === "date" || type === "time") return <PickerField id={id} name={name} label={label} helper={helper} error={error} type={type} initial={value} />;
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        defaultValue={value}
        {...ariaFor(id, error, helper)}
      />
    </Field>
  );
}

/** A whole number. A text box with a number keypad: no spinner, and a typo reaches the schema, which says so in words. */
export function NumberField(props: Common) {
  return <TextField {...props} inputMode="numeric" />;
}

export function TextAreaField({ name, label, helper, defaultValue = "", rows = 3 }: Common & { rows?: number }) {
  const id = `${useId()}-${name}`;
  const { value, error } = useField(name, defaultValue);
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <Textarea id={id} name={name} rows={rows} defaultValue={value} {...ariaFor(id, error, helper)} />
    </Field>
  );
}

/** A dropdown in the tonal input's look: a styled list, not the browser's own. Its value posts under `name`. */
export function SelectField({
  name,
  label,
  helper,
  defaultValue = "",
  options,
  placeholder,
}: Common & { options: readonly { readonly value: string; readonly label: string }[]; placeholder?: string }) {
  const id = `${useId()}-${name}`;
  const { value, error } = useField(name, defaultValue);
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <Choice id={id} name={name} defaultValue={value} options={options} placeholder={placeholder} invalid={error !== undefined} aria-describedby={error !== undefined || helper !== undefined ? `${id}-message` : undefined} />
    </Field>
  );
}

/** A hidden value the action needs, such as the campaign the form belongs to. */
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

/** A tonal block of related fields, with an optional title. A form is a stack of these. */
export function FormGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Tonal className="flex flex-col gap-4">
      {title ? <h3 className="text-row font-semibold">{title}</h3> : null}
      {children}
    </Tonal>
  );
}
