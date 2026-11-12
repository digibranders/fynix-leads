import type { Database } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";

/** A message to send. Plain text only in phase 1B; phase 1C adds the HTML templates. */
export interface MailMessage {
  readonly to: string;
  readonly template: "password_reset";
  readonly subject: string;
  readonly text: string;
}

/** How a message leaves the app. */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * The development transport: writes the message to `email_outbox` and sends nothing (decision D4). Written through
 * `leads_public`, which may insert and nothing else, because a reset is requested by someone who is not signed in.
 * `pnpm mail:last` prints the newest message, which is how a developer gets the reset link. Phase 1C adds the Brevo
 * transport that sends the queued rows and purges the ones that carry a link.
 */
export function devOutboxTransport(publicDb: Database): MailTransport {
  return {
    async send(message) {
      await publicDb.insert(emailOutbox).values({ recipient: message.to, template: message.template, subject: message.subject, body: message.text });
    },
  };
}

export function passwordResetMessage(input: { readonly to: string; readonly resetUrl: string; readonly expiresInMinutes: number }): MailMessage {
  return {
    to: input.to,
    template: "password_reset",
    subject: "Reset your Fynix Leads password",
    text: [
      "Someone asked to reset the password for this email address on Fynix Leads.",
      "",
      `To choose a new password, open this link within ${input.expiresInMinutes} minutes:`,
      input.resetUrl,
      "",
      "If you did not ask for this, ignore this email. Your password stays the same.",
    ].join("\n"),
  };
}

/** What Better Auth's reset callback needs: the address and the one-time token. */
export interface ResetMailer {
  sendPasswordReset(input: { readonly email: string; readonly token: string }): Promise<void>;
}

/** Builds the link to this app's own reset page (Better Auth's HTTP routes are not served) and sends it through `transport`. */
export function passwordResetMailer(transport: MailTransport, origin: string, expiresInMinutes: number): ResetMailer {
  return {
    async sendPasswordReset({ email, token }) {
      const resetUrl = new URL("/reset-password", origin);
      resetUrl.searchParams.set("token", token);
      await transport.send(passwordResetMessage({ to: email, resetUrl: resetUrl.toString(), expiresInMinutes }));
    },
  };
}
