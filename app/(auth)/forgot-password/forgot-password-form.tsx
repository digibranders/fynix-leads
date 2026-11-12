"use client";

import Link from "next/link";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useActionState, useEffect, useRef } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { AuthLink } from "@/components/auth/auth-link";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackFor } from "@/lib/auth/feedback";
import { IDLE } from "@/lib/auth/form-state";
import { RESET_REQUESTED_NOTICE } from "@/lib/auth/messages";
import { requestPasswordResetAction } from "@/server/auth/actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, IDLE);
  const emailRef = useRef<HTMLInputElement>(null);
  const { note } = feedbackFor(state, "forgot-password");

  useEffect(() => {
    if (feedbackFor(state, "forgot-password").note !== null) emailRef.current?.focus();
  }, [state]);

  // The same words for every address: the page never says whether one has an account.
  if (state.status === "sent") {
    return (
      <AuthPanel title="Check your email">
        <div className="mt-[22px] flex flex-col gap-[18px]">
          <Notice tone="blue" icon={EnvelopeSimple} className="-mt-1">
            {RESET_REQUESTED_NOTICE}
          </Notice>
          <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
            Back to sign in
          </Link>
        </div>
      </AuthPanel>
    );
  }

  const email = state.status === "error" || state.status === "rate-limited" ? state.email : "";
  return (
    <AuthPanel title="Reset your password" lede="Enter your email and we will send a reset link.">
      <form action={formAction} noValidate className="mt-[22px] flex flex-col gap-[18px]">
        {note !== null && (
          <Notice id="forgot-note" tone={note.tone} className="-mt-1">
            {note.message}
          </Notice>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={email}
            aria-describedby={note === null ? undefined : "forgot-note"}
          />
        </div>
        <SubmitButton pending={pending} label="Send reset link" pendingLabel="Sending" />
        <div className="flex justify-center">
          <AuthLink href="/sign-in">Back to sign in</AuthLink>
        </div>
      </form>
    </AuthPanel>
  );
}
