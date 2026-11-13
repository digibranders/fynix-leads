"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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

/** A native select in the tonal input's look: the platform's own picker is the best one on a phone. */
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
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={value}
          {...ariaFor(id, error, helper)}
          className={cn(
            "h-11 w-full appearance-none rounded-sm bg-input py-1 pr-10 pl-3.5 text-base text-foreground outline-none transition-[box-shadow,background-color] focus-visible:ring-2 focus-visible:ring-ring aria-invalid:bg-red-soft aria-invalid:ring-2 aria-invalid:ring-red-solid md:text-sm",
          )}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <CaretDown aria-hidden size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </Field>
  );
}

/** A hidden value the action needs, such as the campaign the form belongs to. */
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
