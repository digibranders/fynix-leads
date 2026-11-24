import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";
import type { Auth } from "@/server/auth/create-auth";
import type { ResetMailer } from "@/server/auth/mail";

/** The address has no account. Reset requests answer the same either way, so this is the only way to learn it, and only for an operator. */
export class NoSuchAccountError extends Error {
  constructor(readonly email: string) {
    super(`There is no account for ${email}.`);
    this.name = "NoSuchAccountError";
  }
}

/** A reset mailer that keeps the token in memory instead of queueing an email: the operator is the one choosing the password. */
export interface ResetTokenCapture {
  readonly mailer: ResetMailer;
  /** The token Better Auth issued for `email`, handed out once, or null when it issued none (no such account). */
  readonly take: (email: string) => string | null;
}

export function captureResetToken(): ResetTokenCapture {
  const issued = new Map<string, string>();
  return {
    mailer: {
      async sendPasswordReset({ email, token }) {
        issued.set(normaliseEmail(email), token);
      },
    },
    take(email) {
      const key = normaliseEmail(email);
      const token = issued.get(key) ?? null;
      issued.delete(key);
      return token;
    },
  };
}

export interface SetPasswordServices {
  /** Built with `capture.mailer`, on the `leads_auth` database like every other auth call. */
  readonly auth: Auth;
  readonly capture: ResetTokenCapture;
}

const inputSchema = z.object({
  email: z.email().max(254),
  newPassword: z.string().min(1, "A password is required"),
});

/**
 * Sets the password of any account (Fynix, client or agency) without an email, for `pnpm password:set` and no route.
 *
 * It goes through Better Auth's own reset instead of writing a hash: a reset is requested, the token is taken from the
 * in-memory mailer and used at once. So the password rules and the breached-password check of createAuth's hook apply, the
 * hash is the app's, every session of the account ends (revokeSessionsOnPasswordReset), and the token is used up. Nothing
 * is queued or sent, and nobody is signed in. A refused password (short, breached, check unavailable) changes nothing: the
 * token it left behind never left this process and expires in an hour.
 */
export async function setAccountPassword(services: SetPasswordServices, input: { readonly email: string; readonly newPassword: string }): Promise<{ readonly email: string }> {
  const parsed = inputSchema.parse({ email: normaliseEmail(input.email), newPassword: input.newPassword });
  // A token left in memory by an earlier call must never be taken for this one.
  services.capture.take(parsed.email);
  await services.auth.api.requestPasswordReset({ body: { email: parsed.email } });
  const token = services.capture.take(parsed.email);
  if (token === null) throw new NoSuchAccountError(parsed.email);
  await services.auth.api.resetPassword({ body: { token, newPassword: parsed.newPassword } });
  return { email: parsed.email };
}
