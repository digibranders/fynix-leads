"use client";

import { Copy } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/auth/notice";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_SECOND_FACTOR } from "@/lib/auth/second-factor-state";
import { confirmSecondFactorAction, disableSecondFactorAction, startSecondFactorAction } from "@/server/auth/actions";

/** Splits a base32 secret into groups of four so it can be read out and typed. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function CopyButton({ text, label }: { text: string; label: string }) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy is not available here. Select the text and copy it.");
    }
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy}>
      <Copy aria-hidden />
      {label}
    </Button>
  );
}

/** Step two while the secret is on screen: the app's address and the first code. */
function ConfirmStep({ secret, otpauthUri, onDone }: { secret: string; otpauthUri: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(confirmSecondFactorAction, IDLE_SECOND_FACTOR);
  if (state.status === "enabled") {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="green">The second step is on. Save these backup codes now: they are shown once, and each works one time if you lose your phone.</Notice>
        {state.notice !== null && <Notice tone="amber">{state.notice}</Notice>}
        <ul aria-label="Backup codes" className="grid grid-cols-2 gap-2 rounded-md bg-tonal p-4 font-mono text-body text-ink">
          {state.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={state.backupCodes.join("\n")} label="Copy codes" />
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            I have saved them
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <p className="text-body text-ink-muted">
        In your authenticator app, add an account with this key, or{" "}
        <a className="font-semibold text-primary underline-offset-4 hover:underline" href={otpauthUri}>
          open it in the app on this device
        </a>
        . Then enter the six digit code it shows.
      </p>
      <div className="flex flex-col gap-2 rounded-md bg-tonal p-4">
        <span className="text-table font-semibold text-ink-muted">Setup key</span>
        <code className="font-mono text-body break-all text-ink">{grouped(secret)}</code>
        <div>
          <CopyButton text={secret} label="Copy key" />
        </div>
      </div>
      {state.status === "error" && <Notice tone="red">{state.message}</Notice>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="enrol-code">Code from the app</Label>
        <Input id="enrol-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} spellCheck={false} />
      </div>
      <div className="sm:max-w-[220px]">
        <SubmitButton pending={pending} label="Turn on" pendingLabel="Checking" />
      </div>
    </form>
  );
}

function EnrolFlow() {
  const [state, formAction, pending] = useActionState(startSecondFactorAction, IDLE_SECOND_FACTOR);
  const [finished, setFinished] = useState(false);
  if (finished) return <Notice tone="green">The second step is on.</Notice>;
  if (state.status === "started") return <ConfirmStep secret={state.secret} otpauthUri={state.otpauthUri} onDone={() => setFinished(true)} />;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {state.status === "error" && <Notice tone="red">{state.message}</Notice>}
      <PasswordField id="enrol-password" name="password" label="Your password" autoComplete="current-password" hint="We ask again before changing how you sign in." />
      <div className="sm:max-w-[220px]">
        <SubmitButton pending={pending} label="Set up" pendingLabel="Starting" />
      </div>
    </form>
  );
}

function DisableFlow() {
  const [state, formAction, pending] = useActionState(disableSecondFactorAction, IDLE_SECOND_FACTOR);
  if (state.status === "disabled") return <Notice tone="blue">The second step is off. Reload the page to set it up again.</Notice>;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {state.status === "error" && <Notice tone="red">{state.message}</Notice>}
      <PasswordField id="disable-password" name="password" label="Your password" autoComplete="current-password" hint="Turning it off deletes your backup codes." />
      <div className="sm:max-w-[220px]">
        <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending} className="w-full">
          {pending ? "Turning off" : "Turn off"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The second sign-in step on the profile page, for Fynix people. Off: a password check, then the key for the authenticator app and the first code, then the
 * backup codes once. On: turn it off with the password. `required` is true while the deployment asks every Fynix person to have it.
 */
export function SecondFactorPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {required && !enabled && <Notice tone="amber">Fynix accounts need this step before the other screens open. Set it up here.</Notice>}
      <p className="text-body text-ink-muted">
        {enabled
          ? "After your password, sign-in asks for a code from your authenticator app. A backup code works once if you lose the app."
          : "Add a code from an authenticator app to your sign-in, so a stolen password alone is not enough."}
      </p>
      {enabled ? <DisableFlow /> : <EnrolFlow />}
    </div>
  );
}
