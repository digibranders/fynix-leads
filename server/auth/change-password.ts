import { passwordChangeChecks } from "@/lib/auth/rate-limit-rules";
import { passwordProblem } from "@/lib/auth/password-policy";
import { authErrorCode, authErrorMessage, PASSWORD_CHECK_UNAVAILABLE_CODE, PASSWORD_PROBLEM_CODES } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { AuthServices } from "@/server/auth/sign-in";

export type ChangePasswordResult =
  | { readonly status: "changed" }
  /** The current password was not right. Nothing changed. */
  | { readonly status: "wrong-password" }
  /** `message` is worded for the person to read: too short, missing a kind of character, the same as now, or found in a breach. */
  | { readonly status: "weak-password"; readonly message: string }
  /** The breached-password service could not be reached, so nothing was changed. */
  | { readonly status: "check-unavailable" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

const SAME_PASSWORD = "Choose a password that is different from your current one.";
const WRONG_PASSWORD_CODES: ReadonlySet<string> = new Set(["INVALID_PASSWORD"]);

/**
 * Changes the signed-in person's password through Better Auth's own `changePassword`, which verifies the current one. The new password meets the same rule as
 * a reset: `passwordProblem` first (the rule the reset form shows), then the hook in createAuth that refuses a breached one. Every other session of the
 * account ends and this one carries on (`revokeOtherSessions`). The limit is consumed first, per account, so the current password cannot be guessed.
 * `headers` are the request's, which carry the session cookie.
 */
export async function changeOwnPassword(
  services: AuthServices,
  input: { readonly userId: string; readonly currentPassword: string; readonly newPassword: string; readonly headers: Headers },
): Promise<ChangePasswordResult> {
  const blocked = await firstBlockedLimit(services.publicDb, passwordChangeChecks(input.userId), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  const problem = passwordProblem(input.newPassword);
  if (problem !== null) return { status: "weak-password", message: problem };
  if (input.newPassword === input.currentPassword) return { status: "weak-password", message: SAME_PASSWORD };
  try {
    await services.auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
      headers: input.headers,
    });
    return { status: "changed" };
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== undefined && WRONG_PASSWORD_CODES.has(code)) return { status: "wrong-password" };
    if (code === PASSWORD_CHECK_UNAVAILABLE_CODE) return { status: "check-unavailable" };
    if (code !== undefined && PASSWORD_PROBLEM_CODES.has(code)) return { status: "weak-password", message: authErrorMessage(error) ?? "Choose a different password." };
    throw error;
  }
}
