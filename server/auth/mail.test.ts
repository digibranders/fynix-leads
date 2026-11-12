import { describe, expect, it } from "vitest";
import type { QueuedEmail } from "@/server/mail/outbox";
import { passwordResetMailer } from "./mail";

function recordingOutbox(): { readonly outbox: { enqueue(email: QueuedEmail): Promise<void> }; readonly queued: QueuedEmail[] } {
  const queued: QueuedEmail[] = [];
  return { outbox: { enqueue: async (email) => void queued.push(email) }, queued };
}

describe("passwordResetMailer", () => {
  it("queues one message to the address, with a link to this app's reset page carrying the token", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "https://leads.fynix.digital", 60).sendPasswordReset({ email: "a@example.com", token: "tok-123" });
    expect(queued).toEqual([{ to: "a@example.com", content: { template: "password_reset", params: { expiresInMinutes: 60 } }, link: "https://leads.fynix.digital/reset-password?token=tok-123" }]);
  });

  it("encodes a token that would otherwise change the link", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "http://localhost:3020", 60).sendPasswordReset({ email: "a@example.com", token: "a&b=c d" });
    expect(queued[0]?.link).toBe("http://localhost:3020/reset-password?token=a%26b%3Dc+d");
  });

  it("says in the message how long the link works, from the lifetime it was given", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "http://localhost:3020", 45).sendPasswordReset({ email: "a@example.com", token: "t" });
    expect(queued[0]?.content).toEqual({ template: "password_reset", params: { expiresInMinutes: 45 } });
  });
});
