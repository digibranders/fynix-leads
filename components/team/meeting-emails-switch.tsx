"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { IDLE_FORM, type FormState } from "@/lib/fynix/form-state";
import { cn } from "@/lib/utils";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  memberId: string;
  name: string;
  enabled: boolean;
};

/** One person's "Gets meeting emails" switch. It is a form: pressing it posts the opposite value, and the page shows the saved state after the refresh. A refusal shows under it. */
export function MeetingEmailsSwitch({ action, memberId, name, enabled }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label={`${name} gets meeting emails`}
        disabled={pending}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full outline-offset-2 transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-navy disabled:opacity-60 max-md:before:absolute max-md:before:-inset-2 max-md:before:content-['']",
          enabled ? "bg-navy" : "bg-navy-10",
        )}
      >
        <span aria-hidden className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-raised transition-transform duration-(--dur-hover)", enabled && "translate-x-4")} />
      </button>
      {state.status === "error" && (
        <p role="alert" className="flex max-w-[200px] items-start gap-1 text-xs text-destructive">
          <WarningCircle aria-hidden size={14} weight="fill" className="mt-px shrink-0" />
          {state.message ?? "That did not work. Try again."}
        </p>
      )}
    </form>
  );
}
