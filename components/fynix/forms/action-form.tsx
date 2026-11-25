"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE_FORM, type FormState } from "@/lib/fynix/form-state";
import { useSheetClose } from "./form-sheet";

const FormStateContext = createContext<FormState>(IDLE_FORM);

/** What the form's server action last answered, for the fields to read their error and the value to keep. */
export function useFormState(): FormState {
  return useContext(FormStateContext);
}

const PageLayoutContext = createContext(false);

/** True inside a form on a page of its own, where a group of fields has room for two columns. */
export function useOnPage(): boolean {
  return useContext(PageLayoutContext);
}

/** Set on a form that sits on a page of its own instead of in a drawer. */
export type PageMode = { readonly cancelHref: string };

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  /** What the person reads when the change is saved. */
  savedMessage?: string;
  /** On a page, not in a sheet: no Cancel button, and the button sits under the fields instead of in a sticky foot. */
  inline?: boolean;
  /**
   * On a full page of its own (an "Add" page): the fields flow in the page, and a foot bar stays at the bottom of the screen with Cancel
   * (a link to `cancelHref`) and the one primary button. When the action names no page, the router moves to `cancelHref`.
   */
  page?: PageMode;
  children: React.ReactNode;
};

/**
 * One form inside a `FormSheet`: fields in tonal groups in a scrolling body, a sticky foot with Cancel and the one primary button. A problem
 * with the whole form shows at the top as a notice; a problem with a field shows under the field. When the change is saved the
 * sheet closes and, if the action named a page, the router moves there.
 */
export function ActionForm({ action, submitLabel, pendingLabel, savedMessage = "Saved", inline = false, page, children }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const close = useSheetClose();
  const router = useRouter();
  const returnTo = page?.cancelHref ?? null;

  useEffect(() => {
    if (state.status !== "done") return;
    if (!state.notice) toast.success(savedMessage);
    else toast.warning(state.notice, { duration: 12_000 });
    close();
    const next = state.redirectTo ?? returnTo;
    if (next !== null) router.push(next);
  }, [state, close, router, savedMessage, returnTo]);

  if (page !== undefined) {
    return (
      <FormStateContext.Provider value={state}>
        <PageLayoutContext.Provider value>
          <form action={formAction} noValidate className="flex flex-col gap-4">
            {state.status === "error" && state.message !== null && <Notice tone="red">{state.message}</Notice>}
            {children}
            <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-end gap-2 bg-canvas/90 px-4 py-3 backdrop-blur-md max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:-mx-7 md:px-7">
              <Link href={page.cancelHref} className={buttonVariants({ variant: "secondary" })}>
                Cancel
              </Link>
              <div className="w-full sm:w-56">
                <SubmitButton pending={pending} label={submitLabel} pendingLabel={pendingLabel} />
              </div>
            </div>
          </form>
        </PageLayoutContext.Provider>
      </FormStateContext.Provider>
    );
  }

  return (
    <FormStateContext.Provider value={state}>
      <form action={formAction} noValidate className={inline ? "flex flex-col gap-3" : "flex min-h-0 flex-1 flex-col"}>
        <div className={inline ? "flex flex-col gap-3" : "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-1 pb-5"}>
          {state.status === "error" && state.message !== null && <Notice tone="red">{state.message}</Notice>}
          {children}
        </div>
        {inline ? (
          <div className="sm:max-w-[220px]">
            <SubmitButton pending={pending} label={submitLabel} pendingLabel={pendingLabel} />
          </div>
        ) : (
          <div className="flex shrink-0 gap-2 bg-surface px-5 py-4 shadow-tray">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <div className="flex-1">
              <SubmitButton pending={pending} label={submitLabel} pendingLabel={pendingLabel} />
            </div>
          </div>
        )}
      </form>
    </FormStateContext.Provider>
  );
}
