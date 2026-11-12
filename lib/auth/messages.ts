import { retryMessage } from "./rate-limit-rules";

/**
 * The words a person reads for each result of the three flows. Plain sentences in sentence case, no dashes. The sign-in
 * messages never say which of the address and the password was wrong, nor whether the address has an account.
 */

export const GENERIC_FAILURE = "Something went wrong. Try again in a moment.";

export function signInMessage(status: "invalid-credentials" | "not-active"): string {
  return status === "invalid-credentials" ? "That email and password do not match an account." : "This account cannot sign in right now. Ask your Fynix contact for help.";
}

export const SESSION_ENDED_NOTICE = "Your session has ended. Sign in again.";
export const PASSWORD_CHANGED_NOTICE = "Your password has been changed. Sign in with the new one.";
export const SIGNED_OUT_NOTICE = "You have signed out.";

/** Shown whether or not the address has an account, so the page does not reveal which do. */
export const RESET_REQUESTED_NOTICE = "If that address has an account, a reset link is on its way. It works for 60 minutes.";

export const RESET_LINK_INVALID = "This link is no longer valid. Ask for a new one.";
export const BREACH_CHECK_UNAVAILABLE = "We could not check that password just now. Try again in a minute.";

export { retryMessage };
