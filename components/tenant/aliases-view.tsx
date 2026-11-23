"use client";

import { CheckCircle, CircleNotch, Clock, IdentificationBadge, Plus, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createAliasAction, verifyAliasAction, type AliasActionResult } from "@/server/domain/alias-actions";
import { NATIVE_FIELD } from "./field-classes";

export interface AliasRow {
  readonly publicRef: string;
  readonly displayName: string;
  readonly jobTitle: string;
  readonly clientBrandName: string;
  readonly aliasEmail: string;
  readonly verified: boolean;
}

const IDLE: AliasActionResult = { status: "idle" };

function Notice({ state }: { readonly state: AliasActionResult }) {
  if (state.status === "idle" || state.message === undefined) return null;
  const ok = state.status === "success";
  return (
    <p role={ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-sm px-3.5 py-3 text-table ${ok ? "bg-green-soft text-green-text" : "bg-red-soft text-red-text"}`}>
      {ok ? <CheckCircle aria-hidden size={18} className="mt-px shrink-0" /> : <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />}
      <span>{state.message}</span>
    </p>
  );
}

function VerifyForm({ publicRef }: { readonly publicRef: string }) {
  const [state, action, pending] = useActionState(verifyAliasAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="publicRef" value={publicRef} />
      <label htmlFor={`code-${publicRef}`} className="text-label font-semibold text-ink">
        6-digit code from the mailbox
      </label>
      <div className="flex flex-wrap gap-2">
        <input id={`code-${publicRef}`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={`${NATIVE_FIELD} w-40 font-mono tracking-[0.3em]`} />
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <CircleNotch aria-hidden className="animate-spin" /> : <CheckCircle aria-hidden />}
          Verify
        </Button>
      </div>
      <Notice state={state} />
    </form>
  );
}

function AddForm() {
  const [state, action, pending] = useActionState(createAliasAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised">
      <h2 className="text-section font-semibold text-ink">Add an alias</h2>
      <p className="text-table text-ink-2">One identity per client brand. We email a 6-digit code to the alias address; it works for leads once you enter it.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias-brand" className="text-label font-semibold text-ink">Client brand</label>
          <input id="alias-brand" name="clientBrandName" required className={NATIVE_FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias-name" className="text-label font-semibold text-ink">Display name</label>
          <input id="alias-name" name="displayName" required className={NATIVE_FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias-title" className="text-label font-semibold text-ink">Job title</label>
          <input id="alias-title" name="jobTitle" required className={NATIVE_FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias-email" className="text-label font-semibold text-ink">Alias email</label>
          <input id="alias-email" name="aliasEmail" type="email" required className={NATIVE_FIELD} />
        </div>
      </div>
      <Notice state={state} />
      <div>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <CircleNotch aria-hidden className="animate-spin" /> : <Plus aria-hidden weight="bold" />}
          Add alias
        </Button>
      </div>
    </form>
  );
}

/** The aliases of one agency or supplier person's organisation, with the form to add one and the code check for each that is not verified. */
export function AliasesView({ aliases, canWrite }: { readonly aliases: readonly AliasRow[]; readonly canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {aliases.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-8 text-center shadow-raised">
          <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><IdentificationBadge aria-hidden size={20} /></span>
          <p className="text-row font-semibold text-ink">No aliases yet</p>
          <p className="max-w-[44ch] text-table text-ink-2">Add an alias for each client brand you book for. A lead can only be sent under a verified alias.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {aliases.map((alias) => (
            <li key={alias.publicRef} className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-value font-semibold text-ink">{alias.displayName}</p>
                  <p className="text-table text-ink-2">{alias.jobTitle}, for {alias.clientBrandName}</p>
                  <p className="mt-1 break-all font-mono text-caption text-ink-muted">{alias.aliasEmail} ({alias.publicRef})</p>
                </div>
                {alias.verified ? (
                  <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-green-soft px-2.5 text-label font-semibold text-green-text"><CheckCircle aria-hidden size={14} />Verified</span>
                ) : (
                  <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-amber-soft px-2.5 text-label font-semibold text-amber-text"><Clock aria-hidden size={14} />Waiting for code</span>
                )}
              </div>
              {!alias.verified && canWrite ? <VerifyForm publicRef={alias.publicRef} /> : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? <AddForm /> : <p className="text-table text-ink-2">Only a manager can add aliases.</p>}
    </div>
  );
}
