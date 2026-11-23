"use client";

import { CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { IDLE_FORM, type FormState } from "@/lib/fynix/form-state";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** The values the action needs, such as the campaign and the host. */
  fields: Readonly<Record<string, string>>;
  /** The button's content: an icon and a word. */
  children: React.ReactNode;
  /** A name a screen reader hears, which says what the button acts on ("Remove the share of Ridgeline Partners"). */
  label: string;
  variant?: "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "icon-sm";
  className?: string;
};

/** A button that sends one small change without a sheet. A refusal shows under it in plain words, announced to a screen reader. */
export function InlineAction({ action, fields, children, label, variant = "secondary", size = "sm", className }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Hint label={label}>
        <Button type="submit" variant={variant} size={size} aria-label={label} disabled={pending} aria-busy={pending}>
          {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : children}
        </Button>
      </Hint>
      {state.status === "error" && (
        <p role="alert" className="mt-1.5 flex max-w-[260px] items-start gap-1 text-xs text-destructive">
          <WarningCircle aria-hidden size={14} weight="fill" className="mt-px shrink-0" />
          {state.message ?? Object.values(state.fields)[0] ?? "That did not work. Try again."}
        </p>
      )}
    </form>
  );
}
