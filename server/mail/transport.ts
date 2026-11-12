/** What leaves the app: one message to one address. */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * What a transport says about one attempt. It never throws: a refusal is a value, so a failure to send is recorded and
 * retried by the outbox and never reaches the request that queued the message.
 * - `permanent: true`: trying again cannot help (the provider rejected this message). The outbox marks it failed.
 * - `permanent: false`: try again later (a timeout, a rate limit, the provider is down, our key was refused and can be fixed).
 * `reason` is short, never the provider's response body (which can echo the recipient) and never a secret.
 */
export type SendResult =
  | { readonly ok: true; readonly providerId: string }
  | { readonly ok: false; readonly permanent: boolean; readonly reason: string };

export interface MailTransport {
  send(mail: OutgoingMail): Promise<SendResult>;
}
