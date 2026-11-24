"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/lib/auth/form-state";
import type { FormState } from "@/lib/fynix/form-state";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, retryMessage, SESSION_ENDED_NOTICE, signInMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import { getAuth, getAuthServices, getSessionContext } from "@/server/auth";
import { clientAddressFrom } from "@/server/auth/client-address";
import { fynixSelfWrite } from "@/server/domain/fynix-write";
import { getDomain } from "@/server/domain";
import type { AuditAction } from "@/server/domain/audit";
import { SECOND_FACTOR_MESSAGES, type SecondFactorFormState } from "@/lib/auth/second-factor-state";
import { confirmEnrolment, disableSecondFactor, startEnrolment, verifySecondFactor } from "@/server/auth/second-factor";
import { revalidatePath } from "next/cache";
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
  if (result.status === "second-factor") {
    const next = safeNextPath(field(formData, "next"));
    redirect(next === null ? "/sign-in/verify" : `/sign-in/verify?next=${encodeURIComponent(next)}`);
  }
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

/** Writes the audit row for a change to the person's own second step, in their name. It runs after the change succeeded, and a failure is reported to them. */
async function auditSecondFactor(userId: string, action: AuditAction): Promise<void> {
  await fynixSelfWrite(getDomain().fynixDb, { userId }, (write) => write.audit({ action, subject: { table: "member", id: write.actorMemberId } }));
}

const secondFactorFailed = (message: string): SecondFactorFormState => ({ status: "error", message });

/**
 * The second sign-in step: a code from the authenticator app, or one backup code (`kind` is "backup"). The challenge cookie from the password step is in the
 * request headers. A backup code that signs someone in is written to the audit log in their name; if that fails the person is still signed in and the failure is logged.
 */
export async function verifySecondFactorAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const requestHeaders = await headers();
  const kind = field(formData, "kind") === "backup" ? "backup" : "totp";
  const outcome = await attempt("", () => verifySecondFactor(getAuthServices(), { kind, code: field(formData, "code"), address: clientAddressFrom(requestHeaders), headers: requestHeaders }));
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "signed-in") {
    if (kind === "backup") await attempt("", () => auditSecondFactor(result.userId, "member.backup_code_used"));
    redirect(safeNextPath(field(formData, "next")) ?? DEFAULT_LANDING);
  }
  if (result.status === "start-over") redirect("/sign-in?reason=ended");
  if (result.status === "rate-limited") return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email: "" };
  if (result.status === "locked") return { status: "error", message: SECOND_FACTOR_MESSAGES.locked, email: "" };
  return { status: "error", message: kind === "backup" ? SECOND_FACTOR_MESSAGES.wrongBackupCode : SECOND_FACTOR_MESSAGES.wrongCode, email: "" };
}

/** Step one of turning the step on, from the profile page: the password, then the secret for the app. Fynix people only. */
export async function startSecondFactorAction(_previous: SecondFactorFormState, formData: FormData): Promise<SecondFactorFormState> {
  const context = await getSessionContext();
  if (context === null) return secondFactorFailed(SESSION_ENDED_NOTICE);
  const outcome = await attempt("", async () => startEnrolment(getAuthServices(), { userId: context.userId, kind: context.kind, password: field(formData, "password"), headers: await headers() }));
  if (!outcome.ok) return secondFactorFailed(GENERIC_FAILURE);
  const result = outcome.value;
  if (result.status === "started") return { status: "started", secret: result.secret, otpauthUri: result.otpauthUri };
  if (result.status === "wrong-password") return secondFactorFailed(SECOND_FACTOR_MESSAGES.wrongPassword);
  if (result.status === "already-enrolled") return secondFactorFailed(SECOND_FACTOR_MESSAGES.alreadyOn);
  if (result.status === "not-allowed") return secondFactorFailed(SECOND_FACTOR_MESSAGES.notAllowed);
  return secondFactorFailed(retryMessage(result.retryAfterSeconds));
}

/** Step two: the first code turns the step on and gives back the backup codes, once. A failure to write the audit row does not hide the codes: it is added as a notice. */
export async function confirmSecondFactorAction(_previous: SecondFactorFormState, formData: FormData): Promise<SecondFactorFormState> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "fynix") return secondFactorFailed(SESSION_ENDED_NOTICE);
  const outcome = await attempt("", async () => confirmEnrolment(getAuthServices(), { userId: context.userId, code: field(formData, "code"), headers: await headers() }));
  if (!outcome.ok) return secondFactorFailed(GENERIC_FAILURE);
  const result = outcome.value;
  if (result.status === "enabled") {
    const audited = await attempt("", () => auditSecondFactor(context.userId, "member.two_factor_enable"));
    revalidatePath("/fynix", "layout");
    return { status: "enabled", backupCodes: result.backupCodes, notice: audited.ok ? null : SECOND_FACTOR_MESSAGES.recordFailed };
  }
  if (result.status === "wrong-code") return secondFactorFailed(SECOND_FACTOR_MESSAGES.wrongCode);
  if (result.status === "not-started") return secondFactorFailed(SECOND_FACTOR_MESSAGES.notStarted);
  return secondFactorFailed(retryMessage(result.retryAfterSeconds));
}

/** Turns the step off. Asks for the password, deletes the secret and the backup codes, and writes the audit row. */
export async function disableSecondFactorAction(_previous: SecondFactorFormState, formData: FormData): Promise<SecondFactorFormState> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "fynix") return secondFactorFailed(SESSION_ENDED_NOTICE);
  const outcome = await attempt("", async () => disableSecondFactor(getAuthServices(), { userId: context.userId, password: field(formData, "password"), headers: await headers() }));
  if (!outcome.ok) return secondFactorFailed(GENERIC_FAILURE);
  const result = outcome.value;
  if (result.status === "disabled") {
    const audited = await attempt("", () => auditSecondFactor(context.userId, "member.two_factor_disable"));
    revalidatePath("/fynix", "layout");
    return audited.ok ? { status: "disabled" } : secondFactorFailed(SECOND_FACTOR_MESSAGES.recordFailed);
  }
  if (result.status === "wrong-password") return secondFactorFailed(SECOND_FACTOR_MESSAGES.wrongPassword);
  return secondFactorFailed(retryMessage(result.retryAfterSeconds));
}
