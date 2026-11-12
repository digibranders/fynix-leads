/**
 * What a server action hands back to its form, through React's `useActionState`. A form renders from this alone, and
 * the password is never in it: only the email address, so a failed attempt does not blank the field it came from
 * (React 19 resets a form after its action runs).
 */
export type AuthFormState =
  | { readonly status: "idle" }
  /** The attempt failed in a way the person can fix, or can only retry. `message` is ready to show. */
  | { readonly status: "error"; readonly message: string; readonly email: string }
  | { readonly status: "rate-limited"; readonly message: string; readonly email: string }
  /** A reset link was asked for. The same whether or not the address has an account. */
  | { readonly status: "sent"; readonly email: string }
  /** The reset link is dead: never issued, used already or older than an hour. The page offers a new one. */
  | { readonly status: "invalid-link" };

export const IDLE: AuthFormState = { status: "idle" };
