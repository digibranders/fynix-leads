"use client";

import { Check, CheckCircle, CircleNotch, WarningCircle, X } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { useViewerZone, When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { formatDayInZone, formatTimeInZone, zoneAbbreviation } from "@/lib/time/zones";
import { cn } from "@/lib/utils";
import { clientReviewLeadAction } from "@/server/domain/lead-actions";

/** One proposed time as a card: the day, the clock time large, the zone. A real radio underneath, so the keyboard and screen readers get a radio group. */
function Slot({ iso, index, checked, onSelect }: { iso: string; index: number; checked: boolean; onSelect: () => void }) {
  const zone = useViewerZone();
  const at = new Date(iso);
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-0.5 rounded-md px-4 py-3.5 transition-[background-color,box-shadow,color] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy",
        checked ? "bg-navy text-offwhite shadow-slot" : "bg-tonal hover:bg-navy-08",
      )}
    >
      <input type="radio" name="selectedMeetingTime" value={iso} checked={checked} onChange={onSelect} required={index === 0} className="sr-only" />
      <span suppressHydrationWarning className={cn("text-label font-semibold", checked ? "text-on-navy-text" : "text-ink-muted")}>
        {formatDayInZone(at, zone)}
      </span>
      <span suppressHydrationWarning className="text-[24px] leading-[30px] font-semibold tracking-figure">
        {formatTimeInZone(at, zone)}
      </span>
      <span suppressHydrationWarning className={cn("text-caption", checked ? "text-on-navy-muted" : "text-ink-muted")}>
        {zoneAbbreviation(at, zone)}
      </span>
      {checked ? <CheckCircle aria-hidden weight="fill" size={18} className="absolute top-3 right-3 text-peach" /> : null}
    </label>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-label text-destructive">
      <WarningCircle aria-hidden size={15} weight="fill" className="mt-px shrink-0" />
      {message}
    </p>
  );
}

/**
 * The decision on one lead: pick one of the proposed times and accept it, or decline with a reason. The slots and the accept
 * button are one form; decline opens a dialog because it needs words and cannot be undone by a mis-click.
 */
export function ReviewPanel({ leadId, times }: { leadId: string; times: readonly string[] }) {
  const [selected, setSelected] = useState(times[0] ?? "");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Each result is handled where it arrives: the accept toast, and the decline dialog closing with its own toast.
  const [accept, acceptAction, accepting] = useActionState(async (previous: Parameters<typeof clientReviewLeadAction>[0], formData: FormData) => {
    const result = await clientReviewLeadAction(previous, formData);
    if (result.status === "success") toast.success("Time accepted. The meeting is booked.");
    return result;
  }, IDLE_TENANT_ACTION);
  const [decline, declineAction, declining] = useActionState(async (previous: Parameters<typeof clientReviewLeadAction>[0], formData: FormData) => {
    const result = await clientReviewLeadAction(previous, formData);
    if (result.status === "success") {
      setOpen(false);
      toast.success("Lead declined.");
    }
    return result;
  }, IDLE_TENANT_ACTION);

  return (
    <>
      <form noValidate action={acceptAction} className="flex flex-1 flex-col">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="action" value="accept" />
        <div className="flex flex-col gap-2.5 px-6 pb-6">
          <h3 id={`times-${leadId}`} className="text-body font-semibold">
            Choose a meeting time
          </h3>
          {times.length === 0 ? (
            <p className="text-body text-ink-muted">No times were proposed for this lead. Decline it or ask Fynix to propose new times.</p>
          ) : (
            <div role="radiogroup" aria-labelledby={`times-${leadId}`} className="grid gap-2.5 sm:grid-cols-3">
              {times.map((iso, index) => (
                <Slot key={iso} iso={iso} index={index} checked={selected === iso} onSelect={() => setSelected(iso)} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3 bg-navy-03 px-6 py-4">
          <Button type="button" variant="ghost-destructive" onClick={() => setOpen(true)}>
            <X aria-hidden weight="bold" />
            Decline lead
          </Button>
          <span className="flex-1" />
          {selected ? (
            <span className="text-body text-ink-muted max-sm:hidden">
              <When at={selected} />
            </span>
          ) : null}
          <Button type="submit" size="lg" disabled={accepting || times.length === 0 || selected === ""} aria-busy={accepting}>
            {accepting ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <Check aria-hidden weight="bold" />}
            Accept this time
          </Button>
          {accept.status === "error" ? <div className="basis-full"><ErrorLine message={accept.message ?? "The time could not be accepted."} /></div> : null}
        </div>
      </form>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form noValidate action={declineAction} className="grid gap-4">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="action" value="decline" />
            <DialogHeader>
              <DialogTitle>Decline this lead</DialogTitle>
              <DialogDescription>Say why. Fynix sees your reason and the lead is closed.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`decline-${leadId}`}>Reason</Label>
              <Textarea
                id={`decline-${leadId}`}
                name="declineReason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="For example: the budget is below what we can serve."
                aria-describedby={decline.status === "error" ? `decline-${leadId}-error` : undefined}
              />
              {decline.status === "error" ? <div id={`decline-${leadId}-error`}><ErrorLine message={decline.message ?? "The lead could not be declined."} /></div> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={declining || reason.trim().length === 0} aria-busy={declining}>
                {declining ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Decline lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
