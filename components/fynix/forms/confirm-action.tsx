"use client";

import { CircleNotch } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IDLE_FORM, type FormState } from "@/lib/fynix/form-state";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  fields: Readonly<Record<string, string>>;
  /** The button that opens the question. */
  trigger: React.ReactNode;
  /** The name a screen reader hears on the trigger. */
  triggerLabel: string;
  /** The question, naming what will change. */
  title: string;
  description: string;
  confirmLabel: string;
  savedMessage?: string;
};

/** A change that is hard to undo asks first: the button opens a dialog that names what will happen, and only Confirm sends it. */
export function ConfirmAction({ action, fields, trigger, triggerLabel, title, description, confirmLabel, savedMessage = "Saved" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData): Promise<FormState> => {
    const result = await action(previous, formData);
    if (result.status === "done") {
      toast.success(savedMessage);
      setOpen(false);
      router.refresh();
    }
    return result;
  }, IDLE_FORM);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label={triggerLabel} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {state.status === "error" && state.message !== null ? <Notice tone="red">{state.message}</Notice> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
