"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const CloseContext = createContext<() => void>(() => undefined);

/** Lets a form inside a `FormSheet` close it when the change is saved, or when the person cancels. */
export function useSheetClose(): () => void {
  return useContext(CloseContext);
}

type Props = {
  /** The button that opens the sheet. A server-rendered `Button` element. */
  trigger: React.ReactElement;
  title: string;
  /** One sentence under the title: what this does. */
  description: string;
  children: React.ReactNode;
};

/**
 * A panel-sized sheet for one form: on a phone a bottom sheet, from `md` a panel on the right, the size of the side panel. The
 * look is the same as the side panel's (white, rounded, the raised shadow), and layout switches by CSS only.
 */
export function FormSheet({ trigger, title, description, children }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => close, [close]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-scrim transition-opacity duration-(--dur-state) data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[92dvh] flex-col rounded-t-xl bg-surface text-foreground shadow-popover outline-none transition duration-(--dur-panel) ease-out data-ending-style:translate-y-10 data-ending-style:opacity-0 data-starting-style:translate-y-10 data-starting-style:opacity-0 md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[440px] md:rounded-xl md:data-ending-style:translate-x-10 md:data-ending-style:translate-y-0 md:data-starting-style:translate-x-10 md:data-starting-style:translate-y-0"
        >
          <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-navy-10 md:hidden" />
          <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-title font-semibold tracking-title text-balance">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-body text-ink-2">{description}</Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="secondary" size="icon" aria-label="Close" className="shrink-0" />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <CloseContext.Provider value={value}>{children}</CloseContext.Provider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
