"use client";

import { CheckCircle, CircleNotch, Clock, IdentificationBadge, PencilSimple, Plus, Prohibit, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { CONTROL, Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createAliasAction, retireAliasAction, updateAliasAction, verifyAliasAction, type AliasActionResult } from "@/server/domain/alias-actions";

export interface AliasRow {
  readonly publicRef: string;
  readonly displayName: string;
  readonly jobTitle: string;
  readonly clientName: string;
  readonly aliasEmail: string;
  readonly verified: boolean;
  /** The client the alias is for; null on an alias made before it picked its client from a list. */
  readonly clientOrgId: string | null;
  /** Retired aliases stay on the leads they fronted and can front no new one. */
  readonly retired: boolean;
}

export interface AliasClientOption {
  readonly id: string;
  readonly name: string;
}

const IDLE: AliasActionResult = { status: "idle" };

function Problem({ state }: { readonly state: AliasActionResult }) {
  if (state.status !== "error" || state.message === undefined) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
      <WarningCircle aria-hidden size={18} weight="fill" className="mt-px shrink-0" />
      <span>{state.message}</span>
    </p>
  );
}

function VerifyDialog({ alias }: { readonly alias: AliasRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> => {
    const result = await verifyAliasAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success(result.message ?? "The alias is verified.");
    }
    return result;
  }, IDLE);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Enter code
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form noValidate action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Verify {alias.displayName}</DialogTitle>
              <DialogDescription>We emailed a 6 digit code to {alias.aliasEmail}. Open that mailbox and enter the code here. The alias works for leads once it is verified.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="publicRef" value={alias.publicRef} />
            <Field id={`code-${alias.publicRef}`} label="6 digit code from the mailbox">
              <Input id={`code-${alias.publicRef}`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="w-44 font-mono tracking-[0.3em]" />
            </Field>
            <Problem state={state} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <CheckCircle aria-hidden />}
                Verify alias
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Changes the client, display name or job title of an active alias. The mailbox is fixed. */
function EditAliasDialog({ alias, clients }: { readonly alias: AliasRow; readonly clients: readonly AliasClientOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> => {
    const result = await updateAliasAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success(result.message ?? "The alias is saved.");
    }
    return result;
  }, IDLE);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${alias.displayName}`}>
        <PencilSimple aria-hidden />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form noValidate action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit {alias.displayName}</DialogTitle>
              <DialogDescription>The mailbox {alias.aliasEmail} stays as it is. To use another mailbox, add a new alias.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="publicRef" value={alias.publicRef} />
            <Field id={`edit-client-${alias.publicRef}`} label="Client">
              <select id={`edit-client-${alias.publicRef}`} name="clientOrgId" required defaultValue={alias.clientOrgId ?? ""} className={`${CONTROL} h-(--h-control) w-full rounded-sm px-3 text-[16px] md:text-[13.5px]`}>
                {alias.clientOrgId === null ? (
                  <option value="" disabled>
                    Choose a client
                  </option>
                ) : null}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`edit-name-${alias.publicRef}`} label="Display name">
              <Input id={`edit-name-${alias.publicRef}`} name="displayName" required autoComplete="off" defaultValue={alias.displayName} />
            </Field>
            <Field id={`edit-title-${alias.publicRef}`} label="Job title">
              <Input id={`edit-title-${alias.publicRef}`} name="jobTitle" required autoComplete="off" defaultValue={alias.jobTitle} />
            </Field>
            <Problem state={state} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Save alias
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Retires an alias after the person confirms: it can front no new lead, and the leads it fronted keep their name. */
function RetireAliasDialog({ alias }: { readonly alias: AliasRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> => {
    const result = await retireAliasAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success(result.message ?? "The alias is retired.");
    }
    return result;
  }, IDLE);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Retire ${alias.displayName}`}>
        <Prohibit aria-hidden />
        Retire
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form noValidate action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Retire {alias.displayName}?</DialogTitle>
              <DialogDescription>It can send no new lead. Leads it already fronted keep its name. You cannot bring it back, but you can add a new alias.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="publicRef" value={alias.publicRef} />
            <Problem state={state} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Retire alias
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddAliasSheet({ clients, variant = "default" }: { readonly clients: readonly AliasClientOption[]; readonly variant?: "default" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> => {
    const result = await createAliasAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success(result.message ?? "The alias is added.");
    }
    return result;
  }, IDLE);
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden weight="bold" />
        Add alias
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="end" className="w-full gap-0 overflow-y-auto p-0 md:w-full">
          <form noValidate action={action} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="p-5 pb-3">
              <SheetTitle>Add an alias</SheetTitle>
              <SheetDescription>One identity per client. We email a 6 digit code to the alias address, and the alias works for leads once you enter it.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
              <Field id="alias-client" label="Client">
                <select id="alias-client" name="clientOrgId" required defaultValue="" className={`${CONTROL} h-(--h-control) w-full rounded-sm px-3 text-[16px] md:text-[13.5px]`}>
                  <option value="" disabled>
                    Choose a client
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="alias-name" label="Display name">
                <Input id="alias-name" name="displayName" required autoComplete="off" />
              </Field>
              <Field id="alias-title" label="Job title">
                <Input id="alias-title" name="jobTitle" required autoComplete="off" />
              </Field>
              <Field id="alias-email" label="Alias email">
                <Input id="alias-email" name="aliasEmail" type="email" required autoComplete="off" />
              </Field>
              <Problem state={state} />
            </div>
            <div className="flex items-center justify-end gap-2 bg-popover px-5 py-3.5 shadow-[0_-1px_0_var(--line)]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <Plus aria-hidden weight="bold" />}
                Add alias
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The aliases of one agency or supplier organisation. Adding opens a drawer; a code check opens a dialog. */
export function AliasesView({ aliases, clients, canWrite }: { readonly aliases: readonly AliasRow[]; readonly clients: readonly AliasClientOption[]; readonly canWrite: boolean }) {
  return (
    <Panel aria-label="Aliases">
      <PanelHeader title="Aliases" count={aliases.length > 0 ? aliases.length : undefined} action={canWrite && aliases.length > 0 ? <AddAliasSheet clients={clients} variant="secondary" /> : undefined} />
      {aliases.length === 0 ? (
        <EmptyState
          icon={IdentificationBadge}
          title="No aliases yet"
          action={canWrite ? <AddAliasSheet clients={clients} /> : undefined}
        >
          {canWrite ? "Add an alias for each client you book for. A lead can only be sent under a verified alias." : "A manager adds an alias for each client. A lead can only be sent under a verified alias."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col pb-3">
          {aliases.map((alias) => (
            <li key={alias.publicRef} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none">
              <div className="min-w-0 flex-1 basis-64">
                <Person name={alias.displayName} sub={alias.clientName === "" ? `${alias.jobTitle}, client not set` : `${alias.jobTitle}, for ${alias.clientName}`} />
              </div>
              <p className="min-w-0 basis-full text-caption text-ink-muted md:basis-72 md:flex-none">
                <span className="block break-words">{alias.aliasEmail}</span>
                <span className="block font-mono">{alias.publicRef}</span>
              </p>
              <div className="flex items-center gap-2">
                {alias.retired ? (
                  <Badge variant="quiet">Retired</Badge>
                ) : alias.verified ? (
                  <Badge variant="green">
                    <CheckCircle aria-hidden weight="fill" />
                    Verified
                  </Badge>
                ) : (
                  <>
                    <Badge variant="amber">
                      <Clock aria-hidden weight="fill" />
                      Waiting for code
                    </Badge>
                    {canWrite ? <VerifyDialog alias={alias} /> : null}
                  </>
                )}
                {canWrite && !alias.retired ? (
                  <>
                    <EditAliasDialog alias={alias} clients={clients} />
                    <RetireAliasDialog alias={alias} />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!canWrite && aliases.length > 0 ? <p className="px-5 pb-4 text-label text-ink-muted">Only a manager can add, edit, verify or retire aliases.</p> : null}
    </Panel>
  );
}
