import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";
import { resetCompleteChecks, resetRequestChecks } from "@/lib/auth/rate-limit-rules";
import { authErrorCode, authErrorMessage, DEAD_TOKEN_CODES, PASSWORD_CHECK_UNAVAILABLE_CODE, PASSWORD_PROBLEM_CODES } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { AuthServices } from "@/server/auth/sign-in";

const MAX_EMAIL_LENGTH = 254;
const emailSchema = z.email();

export type ResetRequestResult =
  /** The same answer whether or not the address has an account, and whether or not a message was queued. */
  | { readonly status: "sent" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/**
 * Asks for a reset link. The limits are consumed first, for any address, so they reveal nothing about which exist.
 * Better Auth then looks the address up, writes a one-hour token and calls the mailer, or does the same amount of work
 * and sends nothing when there is no account. A malformed address is answered like any other: "sent".
 */
export async function requestPasswordReset(services: AuthServices, input: { readonly email: string; readonly address: string }): Promise<ResetRequestResult> {
  const email = normaliseEmail(input.email);
  const blocked = await firstBlockedLimit(services.publicDb, resetRequestChecks(email, input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (email.length > MAX_EMAIL_LENGTH || !emailSchema.safeParse(email).success) return { status: "sent" };
  await services.auth.api.requestPasswordReset({ body: { email } });
  return { status: "sent" };
}

export type ResetCompleteResult =
  | { readonly status: "reset" }
  /** The link was never issued, was used already or is older than an hour. */
  | { readonly status: "invalid-token" }
  /** `message` is worded for the person to read: too short, too long, or found in a breach. */
  | { readonly status: "weak-password"; readonly message: string }
  /** The breached-password service could not be reached, so nothing was changed. */
  | { readonly status: "check-unavailable" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Chooses a new password with a reset token. Every session of the account ends with it (revokeSessionsOnPasswordReset). It does not sign anyone in. */
export async function completePasswordReset(
  services: AuthServices,
  input: { readonly token: string; readonly newPassword: string; readonly address: string },
): Promise<ResetCompleteResult> {
  const blocked = await firstBlockedLimit(services.publicDb, resetCompleteChecks(input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  try {
    await services.auth.api.resetPassword({ body: { token: input.token, newPassword: input.newPassword } });
    return { status: "reset" };
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== undefined && DEAD_TOKEN_CODES.has(code)) return { status: "invalid-token" };
    if (code === PASSWORD_CHECK_UNAVAILABLE_CODE) return { status: "check-unavailable" };
    if (code !== undefined && PASSWORD_PROBLEM_CODES.has(code)) return { status: "weak-password", message: authErrorMessage(error) ?? "Choose a different password." };
    throw error;
  }
}
