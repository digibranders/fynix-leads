"use client";

import { Check, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type RefObject } from "react";

type Props = { id: string; name: string; label: string; inputRef: RefObject<HTMLInputElement | null>; error?: string | null };

/** A real checkbox in a 44px row. Its edge is the one hairline in the app: a fill alone would fail the 3:1 rule for a control. Ticking it clears its own error. */
export function AcceptCheckbox({ id, name, label, inputRef, error }: Props) {
  const [checked, setChecked] = useState(false);
  const checkedNow = useRef(false);
  // React resets the form after every action, which would untick the box behind the state's back. Put the person's choice back once the reset is done.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const keep = (): void =>
      queueMicrotask(() => {
        if (inputRef.current) inputRef.current.checked = checkedNow.current;
      });
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, [inputRef]);
  const shown = checked ? null : (error ?? null);
  const errorId = `${id}-error`;
  return (
    <div className="-mt-1 flex flex-col gap-1.5">
      <label htmlFor={id} className="relative flex min-h-11 cursor-pointer items-center gap-3 text-body font-medium">
        <input
          id={id}
          name={name}
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            checkedNow.current = event.target.checked;
            setChecked(event.target.checked);
          }}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? errorId : undefined}
          className="peer absolute size-[22px] opacity-0"
        />
        <span
          aria-hidden
          className={`grid size-6 shrink-0 place-items-center rounded-xs text-offwhite peer-checked:bg-navy peer-checked:shadow-none peer-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--navy)] peer-checked:[&_svg]:opacity-100 ${
            shown ? "bg-red-soft shadow-[inset_0_0_0_1.5px_var(--red-solid)]" : "bg-navy-05 shadow-[inset_0_0_0_1.5px_#6B7782]"
          }`}
        >
          <Check weight="bold" size={14} className="opacity-0" />
        </span>
        {label}
      </label>
      {shown && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-label font-semibold text-red-text">
          <WarningCircle aria-hidden weight="fill" size={16} className="mt-px shrink-0" />
          {shown}
        </p>
      )}
    </div>
  );
}
