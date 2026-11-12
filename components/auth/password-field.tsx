"use client";

import { Eye, EyeSlash, WarningCircle } from "@phosphor-icons/react";
import { useState, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  inputRef?: Ref<HTMLInputElement>;
  /** Shown under the field, and tied to it with `aria-describedby`. */
  hint?: string;
  /** Replaces nothing: shown above the hint, marks the field invalid. */
  error?: string | null;
};

/** A password input with a show control. The control is a real button that only changes the input's type; it never reads or stores the value. */
export function PasswordField({ id, name, label, autoComplete, inputRef, hint, error }: Props) {
  const [shown, setShown] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter((part) => part !== null).join(" ");
  const ToggleIcon = shown ? EyeSlash : Eye;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative flex items-center">
        <Input
          id={id}
          name={name}
          ref={inputRef}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="pr-[92px]"
        />
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="absolute top-0 right-1 inline-flex h-11 min-w-11 items-center gap-1.5 rounded-sm pr-3 pl-2.5 text-table font-semibold text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ToggleIcon aria-hidden size={18} />
          <span>{shown ? "Hide" : "Show"}</span>
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-label font-semibold text-red-text">
          <WarningCircle aria-hidden weight="fill" size={16} className="mt-px shrink-0" />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-label text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
