"use client";

import { useId, useRef, useState } from "react";
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
import { Field } from "@/components/ui/field";
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
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-5 p-6 sm:max-w-[480px]"
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
  const labelId = useId();
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const noteRequired = reason === "other";
  const noteMissing = noteRequired && note.trim() === "";
  const error = submitted && noteMissing ? "Add a note that explains the reason." : undefined;

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (reason === null) return;
    setSubmitted(true);
    if (noteMissing) {
      // The error alone would not move a keyboard or screen reader user, so focus goes to the field it describes.
      noteRef.current?.focus();
      return;
    }
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

      <div className="-mx-2 flex min-h-0 flex-col gap-4 overflow-y-auto px-2 py-0.5">
        <div className="flex flex-col gap-1.5">
          <span id={labelId} className="text-sm font-medium">
            Reason
          </span>
          <RadioGroup
            aria-labelledby={labelId}
            value={reason ?? ""}
            onValueChange={(value) => setReason(value as RejectionReasonCode)}
            className="gap-1"
          >
            {REJECTION_REASONS.map((r) => (
              <Label
                key={r.code}
                className="min-h-11 cursor-pointer gap-3 rounded-sm px-3.5 py-2.5 text-[14px] leading-5 font-medium transition-colors hover:bg-navy-04 has-data-checked:bg-selected has-data-checked:font-semibold"
              >
                <RadioGroupItem value={r.code} />
                {r.label}
              </Label>
            ))}
          </RadioGroup>
        </div>

        <Field
          id={noteId}
          label={noteRequired ? "Note" : "Note (optional)"}
          helper={noteRequired ? "Required when the reason is Other." : "Add detail if it helps the Fynix team."}
          error={error}
        >
          <Textarea
            id={noteId}
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required={noteRequired}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${noteId}-message`}
          />
        </Field>
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="secondary" type="button" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={reason === null}>
          Reject lead
        </Button>
      </DialogFooter>
    </form>
  );
}
