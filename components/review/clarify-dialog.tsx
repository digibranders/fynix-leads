"use client";

import { useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadRef: string;
  prospectName: string;
  onConfirm: (question: string) => void;
};

export function ClarifyDialog({ open, onOpenChange, ...formProps }: Props) {
  const questionRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={questionRef}
        finalFocus={() => document.querySelector<HTMLElement>('[data-review-action="clarify"]')}
        className="gap-5 p-6 sm:max-w-[480px]"
      >
        {/* The form mounts with the dialog, so its state starts empty every time it opens. */}
        <ClarifyForm {...formProps} questionRef={questionRef} />
      </DialogContent>
    </Dialog>
  );
}

function ClarifyForm({
  leadRef,
  prospectName,
  onConfirm,
  questionRef,
}: Omit<Props, "open" | "onOpenChange"> & { questionRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const error = submitted && question.trim() === "" ? "Write your question for the Fynix team." : undefined;

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (question.trim() === "") return;
    onConfirm(question.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>Ask for clarification</DialogTitle>
        <DialogDescription>
          {prospectName}, <span className="font-mono text-xs">{leadRef}</span>
        </DialogDescription>
      </DialogHeader>

      <Field
        id="clarify-question"
        label="What do you need to know?"
        helper="This goes to the Fynix team, not to the prospect."
        error={error}
      >
        <Textarea
          id="clarify-question"
          ref={questionRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby="clarify-question-message"
        />
      </Field>

      <DialogFooter>
        <DialogClose render={<Button variant="secondary" type="button" />}>Cancel</DialogClose>
        <Button type="submit">Send question</Button>
      </DialogFooter>
    </form>
  );
}
