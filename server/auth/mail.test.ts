import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { devOutboxTransport, passwordResetMailer, passwordResetMessage, type MailMessage, type MailTransport } from "./mail";

function recordingTransport(): { readonly transport: MailTransport; readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { transport: { send: async (message) => void sent.push(message) }, sent };
}

describe("passwordResetMailer", () => {
  it("sends one message to the address, with a link to this app's reset page carrying the token", async () => {
    const { transport, sent } = recordingTransport();
    await passwordResetMailer(transport, "https://leads.fynix.digital", 60).sendPasswordReset({ email: "a@example.com", token: "tok-123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("a@example.com");
    expect(sent[0]?.template).toBe("password_reset");
    expect(sent[0]?.text).toContain("https://leads.fynix.digital/reset-password?token=tok-123");
  });

  it("encodes a token that would otherwise change the link", async () => {
    const { transport, sent } = recordingTransport();
    await passwordResetMailer(transport, "http://localhost:3020", 60).sendPasswordReset({ email: "a@example.com", token: "a&b=c d" });
    expect(sent[0]?.text).toContain("http://localhost:3020/reset-password?token=a%26b%3Dc+d");
  });
});

describe("passwordResetMessage", () => {
  const message = passwordResetMessage({ to: "a@example.com", resetUrl: "https://x.example/reset-password?token=t", expiresInMinutes: 60 });

  it("states how long the link works and what to do if it was not asked for", () => {
    expect(message.text).toContain("within 60 minutes");
    expect(message.text).toContain("If you did not ask for this");
  });

  it("uses sentence case and no em or en dashes", () => {
    expect(message.subject).toBe("Reset your Fynix Leads password");
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(dashes.test(`${message.subject}${message.text}`)).toBe(false);
  });
});

describe("devOutboxTransport", () => {
  it("rethrows a failed insert without the SQL parameters, the recipient or the reset link", async () => {
    const token = "live-token-9f8e7d";
    const email = "victim@example.com";
    // drizzle-orm's DrizzleQueryError carries the query and its params in the message and in `params`, and chains the driver error as `cause`.
    const driverError = Object.assign(new Error(`connection terminated for ${email}`), { code: "57P01" });
    const failure = Object.assign(new Error(`Failed query: insert into "email_outbox" values ($1, $2)\nparams: ${email},https://x.example/reset-password?token=${token}`), {
      name: "DrizzleQueryError",
      params: [email, token],
      cause: driverError,
    });
    const db = { insert: () => ({ values: () => Promise.reject(failure) }) } as unknown as Database;

    const thrown = await devOutboxTransport(db)
      .send({ to: email, template: "password_reset", subject: "s", text: `https://x.example/reset-password?token=${token}` })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toContain("Could not write the outbox message");
    const everything = [error.message, error.stack ?? "", JSON.stringify(Object.getOwnPropertyNames(error).map((key) => [key, String((error as unknown as Record<string, unknown>)[key])]))].join("\n");
    for (const secret of [token, email, "email_outbox", "params"]) expect(everything).not.toContain(secret);
    expect(error.cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error).sort()).toEqual(["message", "stack"].sort());
  });
});
