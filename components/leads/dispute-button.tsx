"use client";

import { CircleNotch, Flag, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { disputeLeadAction } from "@/server/domain/lead-actions";

/** Dispute a delivered lead within its 48-hour window. A dialog, because it needs a written reason. */
export function DisputeButton({ leadId, prospectName }: { leadId: string; prospectName: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // The dialog closes from the action's own result, not from an effect that reacts to it.
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof disputeLeadAction>[0], formData: FormData) => {
    const result = await disputeLeadAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success("Dispute filed. Fynix will review it.");
    }
    return result;
  }, IDLE_TENANT_ACTION);

  return (
    <>
      <Button type="button" variant="ghost-destructive" size="xs" onClick={() => setOpen(true)} aria-label={`Dispute ${prospectName}`}>
        <Flag aria-hidden />
        Dispute
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form noValidate action={action} className="grid gap-4">
            <input type="hidden" name="leadId" value={leadId} />
            <DialogHeader>
              <DialogTitle>Dispute {prospectName}</DialogTitle>
              <DialogDescription>You have 48 hours after the meeting to dispute a lead. Explain what does not match the agreed criteria.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`dispute-${leadId}`}>Reason</Label>
              <Textarea
                id={`dispute-${leadId}`}
                name="disputeReason"
                required
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby={state.status === "error" ? `dispute-${leadId}-error` : undefined}
              />
              {state.status === "error" ? (
                <p id={`dispute-${leadId}-error`} role="alert" className="flex items-start gap-1.5 text-label text-destructive">
                  <WarningCircle aria-hidden size={15} weight="fill" className="mt-px shrink-0" />
                  {state.message ?? "The dispute could not be filed."}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 5} aria-busy={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                File dispute
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
