import type { MailTransport, OutgoingMail, SendResult } from "@/server/mail/transport";

/** A transport for tests: it never touches the network. It answers from a script (the last answer repeats) and records every message it is given. */
export class FakeTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  private position = 0;

  constructor(
    private readonly script: readonly (SendResult | "throw")[] = [{ ok: true, providerId: "fake-id" }],
    /** Runs while a message is being sent, for a test that looks at the row mid-send. */
    private readonly during?: (mail: OutgoingMail) => Promise<void>,
  ) {}

  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    await this.during?.(mail);
    const answer = this.script[Math.min(this.position, this.script.length - 1)];
    this.position += 1;
    if (answer === undefined || answer === "throw") throw new Error(`fake transport failure for ${mail.to} with a secret https://x.example/?token=SECRET`);
    return answer;
  }
}
