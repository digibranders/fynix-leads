"use client";

import { useActionState, useState } from "react";
import { AuthLink } from "@/components/auth/auth-link";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE } from "@/lib/auth/form-state";
import { verifySecondFactorAction } from "@/server/auth/actions";

/** A code from the app, or, one tap away, a backup code. The mode is a hidden field the action reads; the form never remembers a code. */
export function VerifyForm({ nextField }: { nextField: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(verifySecondFactorAction, IDLE);
  const [backup, setBackup] = useState(false);
  const failed = state.status === "error" || state.status === "rate-limited";
  return (
    <form action={formAction} noValidate className="mt-[22px] flex flex-col gap-[18px]">
      {failed && (
        <Notice id="verify-note" tone={state.status === "error" ? "red" : "amber"} className="-mt-1">
          {state.message}
        </Notice>
      )}
      {nextField}
      <input type="hidden" name="kind" value={backup ? "backup" : "totp"} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{backup ? "Backup code" : "Code from the app"}</Label>
        <Input
          key={backup ? "backup" : "totp"}
          id="code"
          name="code"
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-describedby={failed ? "verify-note" : undefined}
        />
      </div>
      <SubmitButton pending={pending} label="Sign in" pendingLabel="Checking" />
      <div className="-mt-2 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setBackup((value) => !value)} className="rounded-xs text-body font-semibold text-primary underline-offset-4 hover:underline">
          {backup ? "Use the app instead" : "Use a backup code"}
        </button>
        <AuthLink href="/sign-in">Start again</AuthLink>
      </div>
    </form>
  );
}
