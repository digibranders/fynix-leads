import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE } from "@/lib/auth/messages";
import type { InviteFormState } from "@/lib/domain/invite-form-state";
import { ACCOUNT_EXISTS, TERMS_NOT_ACCEPTED } from "@/lib/domain/invite-messages";

/** Where each part of the last result is shown on the accept-invite form. */
export interface InviteFeedback {
  /** The amber notice directly above the button: a limit, a fault, an unavailable breach check, an address that already has an account. */
  readonly note: string | null;
  /** The blue notice above the terms: the text was replaced while the person read. */
  readonly termsNote: string | null;
  /** Under the password field. */
  readonly passwordError: string | null;
  /** By the box. */
  readonly boxError: string | null;
}

const NONE: InviteFeedback = { note: null, termsNote: null, passwordError: null, boxError: null };

/** Splits an `InviteFormState` into the places the approved comps put each message. */
export function inviteFeedbackFor(state: InviteFormState): InviteFeedback {
  switch (state.status) {
    case "rate-limited":
      return { ...NONE, note: state.message };
    case "terms-changed":
      return { ...NONE, termsNote: state.message };
    case "error":
      if (state.message === TERMS_NOT_ACCEPTED) return { ...NONE, boxError: state.message };
      if (state.message === BREACH_CHECK_UNAVAILABLE || state.message === GENERIC_FAILURE || state.message === ACCOUNT_EXISTS) return { ...NONE, note: state.message };
      return { ...NONE, passwordError: state.message };
    default:
      return NONE;
  }
}
