"use client";

import { CircleNotch, PaperPlaneTilt } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Choice, type ChoiceOption } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { openThreadWithFynixAction } from "@/server/domain/message-actions";

/** "New message to Fynix": pick the campaign it is about, and its thread opens (the one that exists, or a new one). For a client and a coordinator. */
export function NewFynixThread({ campaigns }: { readonly campaigns: readonly ChoiceOption[] }) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns.length === 1 ? (campaigns[0]?.value ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = await openThreadWithFynixAction(campaignId);
      if (result.status === "success" && result.href !== undefined) {
        setOpen(false);
        router.push(result.href);
      } else setError(result.message ?? "The conversation could not be opened. Try again.");
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PaperPlaneTilt aria-hidden weight="bold" />
        New message to Fynix
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New message to Fynix</DialogTitle>
            <DialogDescription>Choose the campaign it is about. If you already have a conversation about it, that one opens.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>Campaign</Label>
            <Choice id={fieldId} options={campaigns} value={campaignId} onValueChange={setCampaignId} placeholder="Choose a campaign" emptyLabel="You have no campaign yet" />
          </div>
          {error !== null ? (
            <p role="alert" className="rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending || campaignId === ""} aria-busy={pending} onClick={submit}>
              {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
              Open conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
