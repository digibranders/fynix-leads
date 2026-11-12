import { PASSWORD_RESET_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import type { Outbox } from "@/server/mail/outbox";

/** What Better Auth's reset callback needs: the address and the one-time token. */
export interface ResetMailer {
  sendPasswordReset(input: { readonly email: string; readonly token: string }): Promise<void>;
}

/**
 * Builds the link to this app's own reset page (Better Auth's HTTP routes are not served) and queues the message in the
 * outbox. The `leads_public` pool writes it, because a reset is requested by someone who is not signed in. Nothing is sent
 * here: the sender (server/mail/outbox.ts, `pnpm outbox:run`) does that, and in development without a Brevo key `pnpm
 * mail:last` prints the link. The message is a template (lib/email/templates.ts), the same for 1B's reset and 1C's invite.
 */
export function passwordResetMailer(outbox: Outbox, origin: string, expiresInMinutes: number = PASSWORD_RESET_LIFETIME_SECONDS / 60): ResetMailer {
  return {
    async sendPasswordReset({ email, token }) {
      const resetUrl = new URL("/reset-password", origin);
      resetUrl.searchParams.set("token", token);
      await outbox.enqueue({ to: email, content: { template: "password_reset", params: { expiresInMinutes } }, link: resetUrl.toString() });
    },
  };
}
