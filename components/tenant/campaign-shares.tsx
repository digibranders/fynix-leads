"use client";

import { CircleNotch, Plus, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { assignShareAction, unassignShareAction } from "@/server/domain/share-actions";
import { NATIVE_FIELD } from "./field-classes";

export interface AssignOption {
  readonly id: string;
  readonly name: string;
  /** What this agency holds of the campaign today, or null when nothing. */
  readonly current: number | null;
}

/** Assigns a campaign to one of the supplier's agencies, or changes the monthly share an agency already holds. */
export function AssignCampaignButton({ campaignId, campaignName, options, label = "Assign to an agency" }: { readonly campaignId: string; readonly campaignName: string; readonly options: readonly AssignOption[]; readonly label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agencyId, setAgencyId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(id: string): void {
    setAgencyId(id);
    const current = options.find((option) => option.id === id)?.current ?? null;
    setAmount(current === null ? "" : String(current));
  }

  function submit(): void {
    setError(null);
    const monthlyShare = Number(amount);
    if (agencyId === "") return setError("Choose who the campaign goes to.");
    if (amount.trim() === "" || !Number.isInteger(monthlyShare) || monthlyShare < 0) return setError("Enter a whole number of leads a month, such as 8.");
    startTransition(async () => {
      const result = await assignShareAction(campaignId, agencyId, monthlyShare);
      if (result.status === "success") {
        setOpen(false);
        setAgencyId("");
        setAmount("");
        router.refresh();
      } else {
        setError(result.message ?? "The campaign could not be assigned.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => { setError(null); setOpen(true); }}>
        <Plus aria-hidden size={14} weight="bold" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Assign {campaignName}</DialogTitle>
            <DialogDescription>Choose who works on this campaign and how many leads a month they carry. Choosing someone who already holds it changes their share.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`assign-who-${campaignId}`} className="text-xs font-semibold text-ink-2">Who</label>
            <Choice id={`assign-who-${campaignId}`} value={agencyId} onValueChange={choose} options={options.map((option) => ({ value: option.id, label: option.current === null ? option.name : `${option.name} (holds ${option.current} a month)` }))} placeholder="Choose an agency" emptyLabel="You have no partner agencies yet" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`assign-amount-${campaignId}`} className="text-xs font-semibold text-ink-2">Leads a month</label>
            <input id={`assign-amount-${campaignId}`} inputMode="numeric" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} placeholder="For example 8" className={NATIVE_FIELD} />
          </div>
          {error !== null ? <p role="alert" className="rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={pending} onClick={submit} className="gap-2">
              {pending ? <CircleNotch aria-hidden className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Takes the campaign back from one agency. */
export function TakeBackButton({ campaignId, agencyOrgId, agencyName }: { readonly campaignId: string; readonly agencyOrgId: string; readonly agencyName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <Hint label={`Take the campaign back from ${agencyName}`}>
        <button
          type="button"
          aria-label={`Take the campaign back from ${agencyName}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await unassignShareAction(campaignId, agencyOrgId);
              if (result.status === "success") router.refresh();
              else setFailed(result.message ?? "Could not take it back.");
            })
          }
          className="grid size-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-navy-07 hover:text-ink disabled:opacity-50"
        >
          {pending ? <CircleNotch aria-hidden size={13} className="animate-spin" /> : <X aria-hidden size={13} weight="bold" />}
        </button>
      </Hint>
      {failed !== null ? <span role="alert" className="text-caption text-red-text">{failed}</span> : null}
    </span>
  );
}
