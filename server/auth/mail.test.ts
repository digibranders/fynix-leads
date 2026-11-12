import { describe, expect, it } from "vitest";
import { passwordResetMailer, passwordResetMessage, type MailMessage, type MailTransport } from "./mail";

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
