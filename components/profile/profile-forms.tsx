"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/auth/notice";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { ActionForm } from "@/components/fynix/forms/action-form";
import { FormGroup, TextField } from "@/components/fynix/forms/form-parts";
import { PASSWORD_RULE } from "@/lib/auth/password-policy";
import { IDLE_FORM } from "@/lib/fynix/form-state";
import { changePasswordAction } from "@/server/auth/actions";
import { updateProfileAction } from "@/server/domain/team-actions";

/** Your name, job title and phone, as the people of your own side see them. */
export function ProfileDetailsForm({ name, phone }: { name: string; phone: string | null }) {
  return (
    <ActionForm inline action={updateProfileAction} submitLabel="Save details" pendingLabel="Saving">
      <FormGroup>
        <TextField name="displayName" label="Full name" defaultValue={name} autoComplete="name" />
        <TextField name="phone" label="Phone (optional)" defaultValue={phone ?? ""} autoComplete="tel" />
      </FormGroup>
    </ActionForm>
  );
}

/**
 * Changes the password. It asks for the current one, applies the rule the reset form shows, and signs you out everywhere else. The fields are never in the
 * state the action hands back, so a failed attempt empties them (React resets the form) and the cursor goes back to the field that was refused.
 */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, IDLE_FORM);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const currentError = state.status === "error" ? (state.fields.currentPassword ?? null) : null;
  const newError = state.status === "error" ? (state.fields.newPassword ?? null) : null;

  useEffect(() => {
    if (state.status === "done") toast.success("Password changed");
    else if (currentError !== null) currentRef.current?.focus();
    else if (newError !== null) newRef.current?.focus();
  }, [state, currentError, newError]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {state.status === "error" && state.message !== null && <Notice tone="red">{state.message}</Notice>}
      <div className="flex flex-col gap-4 rounded-md bg-tonal p-4">
        <PasswordField id="current-password" name="currentPassword" label="Current password" autoComplete="current-password" inputRef={currentRef} error={currentError} />
        <PasswordField id="new-password" name="newPassword" label="New password" autoComplete="new-password" inputRef={newRef} hint={PASSWORD_RULE} error={newError} />
      </div>
      <div className="sm:max-w-[220px]">
        <SubmitButton pending={pending} label="Change password" pendingLabel="Saving" />
      </div>
    </form>
  );
}
