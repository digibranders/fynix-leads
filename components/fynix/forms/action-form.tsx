"use client";

import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect } from "react";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { IDLE_FORM, type FormState } from "@/lib/fynix/form-state";
import { useSheetClose } from "./form-sheet";

const FormStateContext = createContext<FormState>(IDLE_FORM);

/** What the form's server action last answered, for the fields to read their error and the value to keep. */
export function useFormState(): FormState {
  return useContext(FormStateContext);
}

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  children: React.ReactNode;
};

/**
 * One form inside a `FormSheet`: fields in tonal groups in a scrolling body, a sticky foot with Cancel and the one primary button. A problem
 * with the whole form shows at the top as a notice; a problem with a field shows under the field. When the change is saved the
 * sheet closes and, if the action named a page, the router moves there.
 */
export function ActionForm({ action, submitLabel, pendingLabel, children }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const close = useSheetClose();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "done") return;
    close();
    if (state.redirectTo !== null) router.push(state.redirectTo);
  }, [state, close, router]);

  return (
    <FormStateContext.Provider value={state}>
      <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-1 pb-5">
          {state.status === "error" && state.message !== null && <Notice tone="red">{state.message}</Notice>}
          {children}
        </div>
        <div className="flex shrink-0 gap-2 bg-surface px-5 py-4 shadow-tray">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <div className="flex-1">
            <SubmitButton pending={pending} label={submitLabel} pendingLabel={pendingLabel} />
          </div>
        </div>
      </form>
    </FormStateContext.Provider>
  );
}
