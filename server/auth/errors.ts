import { isAPIError } from "better-auth/api";

/** The `code` of a Better Auth error, or `undefined` when the value is not one. Real faults are not API errors, so they never match a code. */
export function authErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const code: unknown = error.body?.code;
  return typeof code === "string" ? code : undefined;
}

/** The message Better Auth or our password hook attached, for the codes whose text is meant for the person. */
export function authErrorMessage(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const message: unknown = error.body?.message;
  return typeof message === "string" ? message : undefined;
}

export const INVALID_CREDENTIALS_CODE = "INVALID_EMAIL_OR_PASSWORD";
export const FAILED_TO_CREATE_SESSION_CODE = "FAILED_TO_CREATE_SESSION";
/** A reset token that was never issued, was used, or has expired. */
export const DEAD_TOKEN_CODES: ReadonlySet<string> = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED"]);
/** Codes the password hook throws, and the two lengths Better Auth itself checks. */
export const PASSWORD_PROBLEM_CODES: ReadonlySet<string> = new Set(["WEAK_PASSWORD", "PASSWORD_BREACHED", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"]);
export const PASSWORD_CHECK_UNAVAILABLE_CODE = "PASSWORD_CHECK_UNAVAILABLE";
