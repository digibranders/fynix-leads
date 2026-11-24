import { secondFactorChecks, secondFactorSetupChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { authErrorCode, FAILED_TO_CREATE_SESSION_CODE } from "@/server/auth/errors";
import { firstBlockedLimit, keyHashFor } from "@/server/auth/rate-limit";
import type { AuthServices } from "@/server/auth/sign-in";

/** What the session check needs to know about the session it is asked about. */
export interface SecondFactorSubject {
  readonly kind: OrganisationKind;
  readonly userId: string;
  readonly sessionId: string;
}

export type SecondFactorCheck = (subject: SecondFactorSubject) => Promise<boolean>;

/**
 * The session-level check `resolveSessionContext` runs for every session; `false` means "not signed in". It accepts every session on purpose: a Fynix
 * session only exists after the password and, for a person with the step turned on, the code (Better Auth deletes the session it made for the password
 * and issues the real one when the code is right). The rule that a Fynix person must have the step turned on is `REQUIRE_FYNIX_2FA`, below, and is a
 * redirect to the profile page, never "not signed in", because a person who is signed out of the page that enrols them can never enrol.
 */
export const secondFactorSatisfied: SecondFactorCheck = async () => true;

/** Where a Fynix person without the step is sent while `REQUIRE_FYNIX_2FA` is on. */
export const SECOND_FACTOR_SETUP_PATH = "/fynix/profile";

/** Whether a Fynix person must have the second step before they reach a Fynix page. Off unless the exact word `true`, so nobody is locked out by a deploy. */
export function fynixSecondFactorRequired(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return source.REQUIRE_FYNIX_2FA === "true";
}

/** True when the rule is on and this Fynix person has not turned the step on. Tenant users are never affected. */
export function secondFactorPending(person: { readonly kind: OrganisationKind; readonly twoFactorEnabled?: boolean }, source?: Readonly<Record<string, string | undefined>>): boolean {
  return person.kind === "fynix" && !person.twoFactorEnabled && fynixSecondFactorRequired(source);
}

const CHALLENGE_COOKIE = /(?:^|;\s*)(?:__Secure-)?fynix-leads\.two_factor=([^;]+)/;

/** The challenge cookie Better Auth issued after the password, or `null` when the request has none (nobody is part way through signing in). */
export function challengeFrom(headers: Headers): string | null {
  return CHALLENGE_COOKIE.exec(headers.get("cookie") ?? "")?.[1] ?? null;
}

/** An authenticator code is six digits, typed with or without a space. A backup code is `xxxxx-xxxxx`, case as issued. */
export function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

export type EnrolStart =
  | { readonly status: "started"; readonly secret: string; readonly otpauthUri: string }
  | { readonly status: "wrong-password" }
  | { readonly status: "already-enrolled" }
  | { readonly status: "not-allowed" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** The secret in an `otpauth://` address, for the person who types it into an authenticator app by hand. */
export function secretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (secret === null || secret === "") throw new Error("The authenticator address carries no secret");
  return secret;
}

/**
 * Step one of turning the step on: asks for the password again and makes the secret. Nothing is on for the person yet: the row stays unverified, so
 * a sign-in still asks for no code until the first one is confirmed. Fynix people only (`kind`), checked here and not just on the screen. Starting again
 * replaces an unconfirmed secret.
 */
export async function startEnrolment(
  services: AuthServices,
  input: { readonly userId: string; readonly kind: OrganisationKind; readonly password: string; readonly headers: Headers },
): Promise<EnrolStart> {
  if (input.kind !== "fynix") return { status: "not-allowed" };
  const blocked = await firstBlockedLimit(services.publicDb, secondFactorSetupChecks(input.userId), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  try {
    const result = await services.auth.api.enableTwoFactor({ body: { password: input.password, issuer: "Fynix Leads" }, headers: input.headers });
    if (result.method !== "totp" || result.totpURI === undefined) throw new Error("Better Auth did not return an authenticator address");
    return { status: "started", secret: secretFromUri(result.totpURI), otpauthUri: result.totpURI };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_PASSWORD") return { status: "wrong-password" };
    if (code === "TOTP_ALREADY_ENABLED") return { status: "already-enrolled" };
    throw error;
  }
}

export type EnrolConfirm =
  /** `backupCodes` are shown once, right now; they are stored encrypted and this is the only time the app reads them out. `headers` carries the new session's cookie. */
  | { readonly status: "enabled"; readonly backupCodes: readonly string[]; readonly headers: Headers }
  | { readonly status: "wrong-code" }
  | { readonly status: "not-started" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Step two: the first code from the app turns the step on and ends this session for a new one (the plugin's doing). Then, and only then, the backup codes are read out. */
export async function confirmEnrolment(
  services: AuthServices,
  input: { readonly userId: string; readonly code: string; readonly headers: Headers },
): Promise<EnrolConfirm> {
  const blocked = await firstBlockedLimit(services.publicDb, secondFactorSetupChecks(input.userId), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  try {
    const { headers } = await services.auth.api.verifyTOTP({ body: { code: cleanCode(input.code) }, headers: input.headers, returnHeaders: true });
    const viewed = await services.auth.api.viewBackupCodes({ body: { userId: input.userId } });
    return { status: "enabled", backupCodes: viewed.backupCodes, headers };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_CODE") return { status: "wrong-code" };
    if (code === "TOTP_NOT_ENABLED") return { status: "not-started" };
    throw error;
  }
}

export type DisableResult = { readonly status: "disabled"; readonly headers: Headers } | { readonly status: "wrong-password" } | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Turns the step off. The password is required, and the plugin ends this session for a new one. Deletes the secret and the backup codes. */
export async function disableSecondFactor(
  services: AuthServices,
  input: { readonly userId: string; readonly password: string; readonly headers: Headers },
): Promise<DisableResult> {
  const blocked = await firstBlockedLimit(services.publicDb, secondFactorSetupChecks(input.userId), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  try {
    const { headers } = await services.auth.api.disableTwoFactor({ body: { password: input.password }, headers: input.headers, returnHeaders: true });
    return { status: "disabled", headers };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_PASSWORD") return { status: "wrong-password" };
    throw error;
  }
}

export type VerifyResult =
  | { readonly status: "signed-in"; readonly userId: string; readonly headers: Headers }
  | { readonly status: "wrong-code" }
  /** The challenge is gone, expired (10 minutes), or used up its five tries: start again from the password. */
  | { readonly status: "start-over" }
  | { readonly status: "locked" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

const START_OVER_CODES: ReadonlySet<string> = new Set(["INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE", "TOTP_NOT_ENABLED", "BACKUP_CODES_NOT_ENABLED", FAILED_TO_CREATE_SESSION_CODE]);

/**
 * The second sign-in step: a code from the app (`kind: "totp"`) or one backup code (`kind: "backup"`, each works once). The limits are consumed first on
 * every attempt, on the network and on the challenge cookie, through `leads_public` and outside any transaction, so the limiter failing means nobody
 * gets in. `headers` are the request's: they carry the challenge cookie.
 */
export async function verifySecondFactor(
  services: AuthServices,
  input: { readonly kind: "totp" | "backup"; readonly code: string; readonly address: string; readonly headers: Headers },
): Promise<VerifyResult> {
  const challenge = challengeFrom(input.headers);
  if (challenge === null) return { status: "start-over" };
  const blocked = await firstBlockedLimit(services.publicDb, secondFactorChecks(input.address, keyHashFor(challenge)), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  const body = { code: input.kind === "totp" ? cleanCode(input.code) : input.code.trim() };
  try {
    const { headers, response } =
      input.kind === "totp"
        ? await services.auth.api.verifyTOTP({ body, headers: input.headers, returnHeaders: true })
        : await services.auth.api.verifyBackupCode({ body, headers: input.headers, returnHeaders: true });
    return { status: "signed-in", userId: response.user.id, headers };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_CODE" || code === "INVALID_BACKUP_CODE") return { status: "wrong-code" };
    if (code === "ACCOUNT_TEMPORARILY_LOCKED") return { status: "locked" };
    if (code !== undefined && START_OVER_CODES.has(code)) return { status: "start-over" };
    throw error;
  }
}
