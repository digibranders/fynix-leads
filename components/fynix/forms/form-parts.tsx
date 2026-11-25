"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Choice } from "@/components/ui/choice";
import { DateField, TimeField } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchChoice } from "@/components/ui/search-choice";
import { Tonal } from "@/components/kit/panel";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_TIME_ZONES, looksLikeTimeZone } from "@/lib/fynix/time-zones";
import { useFormState, useOnPage } from "./action-form";

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
  suggestions,
}: Common & { type?: "text" | "email" | "time" | "date"; inputMode?: "text" | "email" | "numeric"; autoComplete?: string; placeholder?: string; suggestions?: readonly string[] }) {
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
        list={suggestions === undefined ? undefined : `${id}-list`}
        {...ariaFor(id, error, helper)}
      />
      {suggestions === undefined ? null : (
        <datalist id={`${id}-list`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </Field>
  );
}

/** A time zone dropdown with a search box over the common zones. Any other IANA zone can be typed and used; the field posts as `timeZone`. */
export function TimeZoneField({ defaultValue = "", helper }: { defaultValue?: string; helper: string }) {
  const id = `${useId()}-timeZone`;
  const { value, error } = useField("timeZone", defaultValue);
  return (
    <Field id={id} label="Time zone" helper={helper} error={error}>
      <SearchChoice
        id={id}
        name="timeZone"
        options={COMMON_TIME_ZONES}
        defaultValue={value}
        placeholder="Choose a time zone"
        searchPlaceholder="Search, or type Area/City"
        acceptsTyped={looksLikeTimeZone}
        invalid={error !== undefined}
        aria-describedby={error !== undefined || helper !== undefined ? `${id}-message` : undefined}
      />
    </Field>
  );
}

/** A whole number. A text box with a number keypad: no spinner, and a typo reaches the schema, which says so in words. */
export function NumberField(props: Common) {
  return <TextField {...props} inputMode="numeric" />;
}

export function TextAreaField({ name, label, helper, defaultValue = "" }: Common) {
  const id = `${useId()}-${name}`;
  const { value, error } = useField(name, defaultValue);
  const box = useRef<HTMLTextAreaElement>(null);
  // Two lines to start with, growing as the person types. Browsers with `field-sizing: content` do it in CSS; the rest are sized here.
  const grow = () => {
    const el = box.current;
    if (el === null || (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content"))) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(grow, []);
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <Textarea ref={box} id={id} name={name} rows={2} defaultValue={value} onInput={grow} className="max-h-[60dvh] min-h-0 resize-none overflow-y-auto" {...ariaFor(id, error, helper)} />
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
  const onPage = useOnPage();
  // On a page the fields sit two to a row from `md`. A title, a text area, a note or a warning, and a row that already pairs its own fields, take the whole width.
  const layout = onPage
    ? "grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 [&>*:has(textarea)]:md:col-span-2 [&>[role=alert]]:md:col-span-2 [&>div.grid]:md:col-span-2 [&>h3]:md:col-span-2 [&>p]:md:col-span-2"
    : "flex flex-col gap-4";
  return (
    <Tonal className={layout}>
      {title ? <h3 className="text-row font-semibold">{title}</h3> : null}
      {children}
    </Tonal>
  );
}

/** A tick box that appears only after the action refused with a sentence for it (a duplicate name), so a person confirms on purpose. It posts "on" under `name`. */
export function ConfirmField({ name, label }: { name: string; label: string }) {
  const id = `${useId()}-${name}`;
  const state = useFormState();
  const message = state.status === "error" ? state.fields[name] : undefined;
  if (message === undefined) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md bg-amber-soft px-3.5 py-3 text-amber-text">
      <p className="text-body font-medium">{message}</p>
      <div className="flex items-center gap-2.5">
        <input id={id} type="checkbox" name={name} className="size-5 shrink-0 accent-navy" />
        <label htmlFor={id} className="text-body font-medium">
          {label}
        </label>
      </div>
    </div>
  );
}
