"use client";

import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { acceptAgreementAction, type AgreementActionResult } from "@/server/domain/agreement-actions";

const IDLE: AgreementActionResult = { status: "idle" };

/** What is being agreed, in words: shown in the confirm step so nobody accepts blind. */
export interface AcceptSummary {
  readonly campaignName: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
}

/** Accept a version of the agreement. The button opens a confirm step that names the campaign, the version and its numbers; only Confirm sends it. */
export function AcceptAgreementButton({ agreementId, summary }: { readonly agreementId: string; readonly summary: AcceptSummary }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: AgreementActionResult, formData: FormData): Promise<AgreementActionResult> => {
    const result = await acceptAgreementAction(previous, formData);
    if (result.status === "success") {
      toast.success("Agreement accepted");
      setOpen(false);
      router.refresh();
    }
    return result;
  }, IDLE);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <CheckCircle aria-hidden weight="bold" />
        Accept this version
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Accept version {summary.version} for {summary.campaignName}?
            </DialogTitle>
            <DialogDescription>
              You agree to {summary.monthlyTarget} meetings a month and {summary.totalTarget} in total, with a dispute window of {summary.disputeWindowHours} hours, and to the counting rules shown. Your name and the time are recorded.
            </DialogDescription>
          </DialogHeader>
          <form noValidate action={action} className="flex flex-col gap-3">
            <input type="hidden" name="agreementId" value={agreementId} />
            {state.status === "error" && state.message !== undefined ? (
              <p role="alert" className="flex items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
                <WarningCircle aria-hidden size={18} weight="fill" className="mt-px shrink-0" />
                <span>{state.message}</span>
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Confirm and accept
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
