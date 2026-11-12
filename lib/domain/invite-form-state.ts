/**
 * What the accept-invite action hands back to its form through React's `useActionState`. The form renders from this alone,
 * and the password is never in it: React 19 resets a form after its action runs, and the page has nothing to refill but the
 * password, which is never sent back.
 */
export type InviteFormState =
  | { readonly status: "idle" }
  /** The attempt failed in a way the person can fix (a short or breached password, the box not ticked) or can only retry. `message` is ready to show. */
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "rate-limited"; readonly message: string }
  /** A newer version of the terms was published while the page was open. The page refreshes to show the current text; the person must read and accept it. */
  | { readonly status: "terms-changed"; readonly message: string }
  /** The link stopped working while the person was typing: it ran out, was withdrawn, or was used in another tab. */
  | { readonly status: "unavailable"; readonly reason: "invalid" | "expired" | "revoked" | "redeemed"; readonly message: string };

export const INVITE_IDLE: InviteFormState = { status: "idle" };
