"use client";

import { useActionState, useEffect, useRef } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { LinkNotValid } from "@/components/auth/link-not-valid";
import { Notice } from "@/components/auth/notice";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { feedbackFor } from "@/lib/auth/feedback";
import { IDLE } from "@/lib/auth/form-state";
import { PASSWORD_RULE } from "@/lib/auth/password-policy";
import { completePasswordResetAction } from "@/server/auth/actions";

/** The token arrives as a prop from the server page and travels in a hidden field. It is never printed. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(completePasswordResetAction, IDLE);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { note, fieldError } = feedbackFor(state, "reset-password");

  // A refused password empties the field (React resets the form); put the cursor back in it.
  useEffect(() => {
    if (feedbackFor(state, "reset-password").fieldError !== null) passwordRef.current?.focus();
  }, [state]);

  if (state.status === "invalid-link") {
    return (
      <AuthPanel title="Link not valid">
        <LinkNotValid />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title="Choose a new password">
      <form action={formAction} noValidate className="mt-[22px] flex flex-col gap-[18px]">
        {note !== null && (
          <Notice tone={note.tone} className="-mt-1">
            {note.message}
          </Notice>
        )}
        <input type="hidden" name="token" value={token} />
        <PasswordField id="password" name="password" label="New password" autoComplete="new-password" inputRef={passwordRef} hint={PASSWORD_RULE} error={fieldError} />
        <SubmitButton pending={pending} label="Set new password" pendingLabel="Saving" />
      </form>
    </AuthPanel>
  );
}
