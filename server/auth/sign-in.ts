import { normaliseEmail } from "@/lib/auth/email";
import { signInChecks } from "@/lib/auth/rate-limit-rules";
import type { Auth } from "@/server/auth/create-auth";
import { authErrorCode, FAILED_TO_CREATE_SESSION_CODE, INVALID_CREDENTIALS_CODE } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { Database } from "@/server/db/pool";

export interface AuthServices {
  readonly auth: Auth;
  /** The `leads_public` database, for the rate limits. */
  readonly publicDb: Database;
  readonly now?: () => Date;
}

export type SignInResult =
  /** `headers` carries the `Set-Cookie` for the new session. Inside Next.js the nextCookies plugin has also set it. */
  | { readonly status: "signed-in"; readonly userId: string; readonly headers: Headers }
  /**
   * One answer for an unknown address, a wrong password, a malformed request and a right password for a user with no
   * active membership, so nothing says which accounts exist or which passwords are right.
   */
  | { readonly status: "invalid-credentials" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Better Auth's reasons for a request that is wrong and not a fault: all of them are shown as invalid credentials. */
const CREDENTIAL_PROBLEM_CODES: ReadonlySet<string> = new Set([INVALID_CREDENTIALS_CODE, "INVALID_EMAIL", "INVALID_PASSWORD"]);

/**
 * Signs a user in with email and password. The three rate limits (network, account and network, account) are consumed
 * first, on every attempt, success or not, through `leads_public` and outside any transaction. If the limiter fails the
 * error propagates and nobody signs in: it fails closed.
 */
export async function signInWithPassword(
  services: AuthServices,
  input: { readonly email: string; readonly password: string; readonly address: string; readonly headers?: Headers },
): Promise<SignInResult> {
  const email = normaliseEmail(input.email);
  const blocked = await firstBlockedLimit(services.publicDb, signInChecks(email, input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };

  try {
    const { headers, response } = await services.auth.api.signInEmail({ body: { email, password: input.password }, headers: input.headers, returnHeaders: true });
    return { status: "signed-in", userId: response.user.id, headers };
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== undefined && CREDENTIAL_PROBLEM_CODES.has(code)) return { status: "invalid-credentials" };
    // The session hook refused: no active membership. Answered like a wrong password; the attempt was already counted above.
    if (code === FAILED_TO_CREATE_SESSION_CODE) return { status: "invalid-credentials" };
    throw error;
  }
}
