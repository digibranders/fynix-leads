"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/lib/auth/form-state";
import type { FormState } from "@/lib/fynix/form-state";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, retryMessage, SESSION_ENDED_NOTICE, signInMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import { getAuth, getAuthServices, getSessionContext } from "@/server/auth";
import { clientAddressFrom } from "@/server/auth/client-address";
import { changeOwnPassword } from "@/server/auth/change-password";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { signInWithPassword } from "@/server/auth/sign-in";

/**
 * The server actions behind the three forms and the sign-out button. They are the only entry points to sign-in, reset
 * and sign-out, and each is a thin shell: read the form, read the network address from the proxy header, call one
 * service from server/auth, and turn its result into an `AuthFormState` or a redirect. All the rules live in the
 * services. Every export of a "use server" file is a public endpoint, so this file exports nothing but actions.
 */

/** Where a person lands after signing in when no safe `next` was given. */
const DEFAULT_LANDING = "/welcome";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly state: AuthFormState };

/**
 * Runs a service call. A fault (the database is down, a bug) becomes a form state with a neutral message, and only the
 * error's name is logged, because its message can carry an address. `redirect()` works by throwing, so it is always
 * called outside this wrapper, after the result is known.
 */
async function attempt<T>(email: string, work: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    console.error("An auth action failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, state: { status: "error", message: GENERIC_FAILURE, email } };
  }
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const requestHeaders = await headers();
  const outcome = await attempt(email, () =>
    signInWithPassword(getAuthServices(), { email, password: field(formData, "password"), address: clientAddressFrom(requestHeaders), headers: requestHeaders }),
  );
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "signed-in") redirect(safeNextPath(field(formData, "next")) ?? DEFAULT_LANDING);
  if (result.status === "rate-limited") return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email };
  return { status: "error", message: signInMessage(), email };
}

export async function requestPasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const address = clientAddressFrom(await headers());
  const outcome = await attempt(email, () => requestPasswordReset(getAuthServices(), { email, address }));
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "rate-limited") return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email };
  return { status: "sent", email };
}

export async function completePasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const address = clientAddressFrom(await headers());
  const outcome = await attempt("", () => completePasswordReset(getAuthServices(), { token: field(formData, "token"), newPassword: field(formData, "password"), address }));
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "reset") redirect("/sign-in?reset=1");
  if (result.status === "invalid-token") return { status: "invalid-link" };
  if (result.status === "check-unavailable") return { status: "error", message: BREACH_CHECK_UNAVAILABLE, email: "" };
  if (result.status === "weak-password") return { status: "error", message: result.message, email: "" };
  return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email: "" };
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in?signed-out=1");
}

/**
 * The profile page's change-password form, for every portal. It needs a signed-in person, asks for the current password and never gives a password back:
 * an error carries only the sentence for the field it belongs to. Better Auth ends the person's other sessions and keeps this one.
 */
export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const requestHeaders = await headers();
  const context = await getSessionContext();
  if (context === null) return { status: "error", message: SESSION_ENDED_NOTICE, fields: {}, values: {} };
  const outcome = await attempt("", () =>
    changeOwnPassword(getAuthServices(), { userId: context.userId, currentPassword: field(formData, "currentPassword"), newPassword: field(formData, "newPassword"), headers: requestHeaders }),
  );
  if (!outcome.ok) return { status: "error", message: GENERIC_FAILURE, fields: {}, values: {} };
  const result = outcome.value;
  if (result.status === "changed") return { status: "done", redirectTo: null };
  if (result.status === "wrong-password") return { status: "error", message: null, fields: { currentPassword: "That is not your current password." }, values: {} };
  if (result.status === "weak-password") return { status: "error", message: null, fields: { newPassword: result.message }, values: {} };
  if (result.status === "check-unavailable") return { status: "error", message: BREACH_CHECK_UNAVAILABLE, fields: {}, values: {} };
  return { status: "error", message: retryMessage(result.retryAfterSeconds), fields: {}, values: {} };
}
