"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AuthLink } from "@/components/auth/auth-link";
import { Notice } from "@/components/auth/notice";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackFor } from "@/lib/auth/feedback";
import { IDLE } from "@/lib/auth/form-state";
import { signInAction } from "@/server/auth/actions";

type Props = {
  /** The notice a query flag asks for (server rendered). Shown only until the first attempt, so there is never more than one. */
  notice: React.ReactNode;
  /** The hidden `next` field, when the query carried a safe one (server rendered). */
  nextField: React.ReactNode;
};

export function SignInForm({ notice, nextField }: Props) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE);
  const emailRef = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState(false);
  const { note } = feedbackFor(state, "sign-in");
  const email = state.status === "error" || state.status === "rate-limited" ? state.email : "";

  // A failed attempt returns focus to the email field, the first thing to check.
  useEffect(() => {
    if (feedbackFor(state, "sign-in").note !== null) emailRef.current?.focus();
  }, [state]);

  // An empty field never reaches the server, so the person is told what is missing rather than that the details "do not match".
  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    const form = event.currentTarget;
    const data = new FormData(form);
    const empty = ["email", "password"].find((name) => String(data.get(name) ?? "").trim() === "");
    if (empty === undefined) {
      setMissing(false);
      return;
    }
    event.preventDefault();
    setMissing(true);
    const target = form.elements.namedItem(empty);
    if (target instanceof HTMLElement) target.focus();
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-[22px] flex flex-col gap-[18px]">
      {missing ? (
        <Notice id="sign-in-note" tone="red" className="-mt-1">
          Enter your email and your password.
        </Notice>
      ) : note === null ? (
        notice
      ) : (
        <Notice id="sign-in-note" tone={note.tone} className="-mt-1">
          {note.message}
        </Notice>
      )}
      {nextField}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={email}
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={note === null ? undefined : "sign-in-note"}
          // The notice above already says what is wrong, so the field keeps its calm fill; only the focus ring shows.
          className="aria-invalid:bg-input aria-invalid:shadow-[inset_0_0_0_1px_var(--ctl-edge)] aria-invalid:focus-visible:bg-surface aria-invalid:focus-visible:shadow-[inset_0_0_0_2px_var(--navy)]"
        />
      </div>
      <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />
      <div className="-mt-2 flex justify-end">
        <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
      </div>
      <SubmitButton pending={pending} label="Sign in" pendingLabel="Signing in" />
    </form>
  );
}
