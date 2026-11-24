import { MAIL_SENDER } from "@/server/mail/brevo";

/**
 * The phase 6 switches, read from the environment at the moment they are asked for, so a test can change them and a deploy can flip one with a restart. They are
 * read here and not through `getEnv()` because the domain functions that queue the emails take narrow dependencies, and a missing database URL must never
 * decide whether an email goes out. Anything but the exact word `true` is off.
 */
type Source = Readonly<Record<string, string | undefined>>;

/** Whether the launch emails are queued and sent. Off unless `LAUNCH_EMAILS_ENABLED` is `true`. */
export function launchEmailsEnabled(source: Source = process.env): boolean {
  return source.LAUNCH_EMAILS_ENABLED === "true";
}

export interface MailSenderIdentity {
  readonly email: string;
  readonly name: string;
}

const present = (value: string | undefined): string | undefined => (value === undefined || value.trim() === "" ? undefined : value.trim());

/** The address messages go out from: `MAIL_SENDER_ADDRESS` when set, otherwise "Fynix" at hello@fynix.digital as before. */
export function senderFromEnv(source: Source = process.env): MailSenderIdentity {
  const address = present(source.MAIL_SENDER_ADDRESS);
  if (address === undefined) return { email: MAIL_SENDER.email, name: present(source.MAIL_SENDER_NAME) ?? MAIL_SENDER.name };
  return { email: address, name: present(source.MAIL_SENDER_NAME) ?? address };
}

/** True when a neutral sender address is set: one that does not name Fynix. Prospect letters are not queued without it. */
export function hasNeutralSender(source: Source = process.env): boolean {
  const sender = senderFromEnv(source);
  return present(source.MAIL_SENDER_ADDRESS) !== undefined && !/fynix/i.test(sender.email) && !/fynix/i.test(sender.name);
}
