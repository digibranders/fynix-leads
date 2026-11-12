import type { AuthFormState } from "@/lib/auth/form-state";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE } from "@/lib/auth/messages";

/** How a form shows its last result: a notice above the fields, or an error under the one field it is about. */
export interface Feedback {
  readonly note: { readonly tone: "red" | "amber"; readonly message: string } | null;
  readonly fieldError: string | null;
}

const NONE: Feedback = { note: null, fieldError: null };

/**
 * Splits an `AuthFormState` into what each form renders. A rate limit is an amber notice. A fault or an unavailable
 * breach check is a notice (nothing is wrong with what the person typed). On the reset form any other error is about
 * the new password, so it sits under that field; on the other forms an error is the red notice.
 */
export function feedbackFor(state: AuthFormState, form: "sign-in" | "forgot-password" | "reset-password"): Feedback {
  if (state.status === "rate-limited") return { note: { tone: "amber", message: state.message }, fieldError: null };
  if (state.status !== "error") return NONE;
  if (form !== "reset-password" || state.message === GENERIC_FAILURE) return { note: { tone: "red", message: state.message }, fieldError: null };
  if (state.message === BREACH_CHECK_UNAVAILABLE) return { note: { tone: "amber", message: state.message }, fieldError: null };
  return { note: null, fieldError: state.message };
}
