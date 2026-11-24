import type { MailTransport, OutgoingMail, SendResult } from "@/server/mail/transport";

/** The sender every message goes out from until `MAIL_SENDER_ADDRESS` is set: the address verified in Brevo (decision D4). */
export const MAIL_SENDER: { readonly email: string; readonly name: string } = { email: "hello@fynix.digital", name: "Fynix" };
export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface BrevoOptions {
  /** The API key. It is only ever put in the `api-key` header: never in a log line, an error, a reason or a URL. */
  readonly apiKey: string;
  /** The address and default display name every message is sent from. Unset means the default above. */
  readonly sender?: { readonly email: string; readonly name: string };
  /** Injectable so tests never reach the network. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Brevo's short error code from a failure body (`invalid_parameter`), or nothing. The body's `message` is not used: it can quote the recipient. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const code = isRecord(body) ? body.code : undefined;
    return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? ` ${code}` : "";
  } catch {
    return "";
  }
}

/**
 * Sends through Brevo's transactional email API (`POST /v3/smtp/email`) with the global `fetch`: no SDK, so no dependency.
 * Mapping, written down because the outbox acts on it:
 * - 2xx: sent, and the `messageId` is the provider id.
 * - 400 and 422: the message itself was refused (an invalid address, say): permanent.
 * - 401 and 403: our key was refused. Not permanent: someone can fix the key within the retry window (about two and a half
 *   hours) and the same message then goes out.
 * - 429, 5xx, a timeout or a network error: transient.
 */
export function brevoTransport(options: BrevoOptions): MailTransport {
  const send = options.fetch ?? fetch;
  const sender = options.sender ?? MAIL_SENDER;
  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      let response: Response;
      try {
        response = await send(BREVO_SEND_URL, {
          method: "POST",
          headers: { "api-key": options.apiKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: mail.fromName === undefined ? sender : { email: sender.email, name: mail.fromName },
            to: [{ email: mail.to }],
            subject: mail.subject,
            textContent: mail.text,
            htmlContent: mail.html,
            ...(mail.replyTo === undefined ? {} : { replyTo: { email: mail.replyTo } }),
            ...(mail.attachments === undefined || mail.attachments.length === 0 ? {} : { attachment: mail.attachments.map((file) => ({ name: file.name, content: file.contentBase64 })) }),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        return { ok: false, permanent: false, reason: error instanceof Error && error.name === "TimeoutError" ? "brevo timed out" : "brevo could not be reached" };
      }
      if (response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const id = isRecord(body) ? body.messageId : undefined;
        return { ok: true, providerId: typeof id === "string" && id !== "" ? id : "accepted" };
      }
      const permanent = response.status === 400 || response.status === 422;
      return { ok: false, permanent, reason: `brevo answered ${response.status}${await errorCode(response)}` };
    },
  };
}
