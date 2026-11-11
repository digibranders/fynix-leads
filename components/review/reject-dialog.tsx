"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/dev/field";
import { REJECTION_REASONS, type RejectionReasonCode } from "@/lib/domain/rejection-reasons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadRef: string;
  prospectName: string;
  onConfirm: (reason: RejectionReasonCode, note: string) => void;
};

export function RejectDialog({ open, onOpenChange, ...formProps }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() => document.querySelector<HTMLElement>('[data-review-action="reject"]')}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md"
      >
        {/* The form mounts with the dialog, so its state starts empty every time it opens. */}
        <RejectForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({ leadRef, prospectName, onConfirm }: Omit<Props, "open" | "onOpenChange">) {
  const [reason, setReason] = useState<RejectionReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const noteRequired = reason === "other";
  const noteMissing = noteRequired && note.trim() === "";
  const error = submitted && noteMissing ? "Add a note that explains the reason." : undefined;

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (reason === null) return;
    setSubmitted(true);
    if (noteMissing) return;
    onConfirm(reason, note.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>Reject lead</DialogTitle>
        <DialogDescription>
          {prospectName}, <span className="font-mono text-xs">{leadRef}</span>. The Fynix team sees your reason.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-0.5">
        <div className="flex flex-col gap-1.5">
          <span id="reject-reason-label" className="text-sm font-medium">
            Reason
          </span>
          <RadioGroup
            aria-labelledby="reject-reason-label"
            value={reason ?? ""}
            onValueChange={(value) => setReason(value as RejectionReasonCode)}
            className="gap-0.5"
          >
            {REJECTION_REASONS.map((r) => (
              <Label
                key={r.code}
                className="min-h-10 cursor-pointer lg:min-h-8 gap-2.5 rounded-md px-2 py-1.5 font-normal transition-colors hover:bg-accent"
              >
                <RadioGroupItem value={r.code} />
                {r.label}
              </Label>
            ))}
          </RadioGroup>
        </div>

        <Field
          id="reject-note"
          label={noteRequired ? "Note" : "Note (optional)"}
          helper={noteRequired ? "Required when the reason is Other." : "Add detail if it helps the Fynix team."}
          error={error}
        >
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required={noteRequired}
            aria-invalid={error ? true : undefined}
            aria-describedby="reject-note-message"
          />
        </Field>
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={reason === null}>
          Reject lead
        </Button>
      </DialogFooter>
    </form>
  );
}
