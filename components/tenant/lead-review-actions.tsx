"use client";

import { Check, CircleNotch, WarningCircle, X } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clientReviewLeadAction,
  disputeLeadAction,
  IDLE_TENANT_ACTION,
} from "@/server/domain/lead-actions";

export function AcceptLeadTimeButton({
  leadId,
  meetingTimeIso,
  displayTime,
}: {
  readonly leadId: string;
  readonly meetingTimeIso: string;
  readonly displayTime: string;
}) {
  const [state, formAction, pending] = useActionState(clientReviewLeadAction, IDLE_TENANT_ACTION);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="action" value="accept" />
      <input type="hidden" name="selectedMeetingTime" value={meetingTimeIso} />
      <Button
        type="submit"
        variant="default"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        className="gap-1.5"
      >
        {pending ? (
          <CircleNotch aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <Check aria-hidden weight="bold" />
        )}
        <span>Accept {displayTime}</span>
      </Button>
      {state.status === "error" && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <WarningCircle aria-hidden size={14} weight="fill" />
          {state.message ?? "Could not accept time."}
        </p>
      )}
    </form>
  );
}

export function DeclineLeadForm({ leadId }: { readonly leadId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(clientReviewLeadAction, IDLE_TENANT_ACTION);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <X aria-hidden />
        <span>Decline</span>
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-ink-4/20 p-3 bg-surface">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="action" value="decline" />
      <label htmlFor={`decline-reason-${leadId}`} className="text-xs font-semibold text-ink-2">
        Reason for declining
      </label>
      <input
        id={`decline-reason-${leadId}`}
        name="declineReason"
        type="text"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Budget does not meet requirement"
        className="rounded border border-ink-4/30 px-2 py-1 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-2 mt-1">
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending || reason.trim().length === 0}
          aria-busy={pending}
        >
          {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : "Confirm Decline"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive mt-1">
          <WarningCircle aria-hidden size={14} weight="fill" />
          {state.message ?? "Could not decline lead."}
        </p>
      )}
    </form>
  );
}

export function DisputeLeadForm({ leadId }: { readonly leadId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(disputeLeadAction, IDLE_TENANT_ACTION);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <WarningCircle aria-hidden />
        <span>Dispute Lead</span>
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-ink-4/20 p-3 bg-surface">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`dispute-reason-${leadId}`} className="text-xs font-semibold text-ink-2">
        Reason for dispute (48-hour window)
      </label>
      <textarea
        id={`dispute-reason-${leadId}`}
        name="disputeReason"
        required
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why this lead does not meet agreed BANT criteria or meeting requirements."
        className="rounded border border-ink-4/30 p-2 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-2 mt-1">
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending || reason.trim().length < 5}
          aria-busy={pending}
        >
          {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : "Submit Dispute"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive mt-1">
          <WarningCircle aria-hidden size={14} weight="fill" />
          {state.message ?? "Could not file dispute."}
        </p>
      )}
    </form>
  );
}
