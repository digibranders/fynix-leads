import { describe, expect, it } from "vitest";
import * as messages from "./messages";

describe("messages", () => {
  it("say the same thing for a wrong password and an unknown address, because they are one result", () => {
    expect(messages.signInMessage("invalid-credentials")).toBe("That email and password do not match an account.");
  });

  it("do not reveal whether an address has an account when a reset is asked for", () => {
    expect(messages.RESET_REQUESTED_NOTICE).toMatch(/^If that address has an account/);
  });

  it("state the one hour a reset link works, which is the lifetime in session-lifetime.ts", async () => {
    const { PASSWORD_RESET_LIFETIME_SECONDS } = await import("./session-lifetime");
    expect(messages.RESET_REQUESTED_NOTICE).toContain(`${PASSWORD_RESET_LIFETIME_SECONDS / 60} minutes`);
  });

  it("use sentence case, end with a full stop, and have no exclamation mark, em dash or en dash", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    const texts: string[] = [];
    for (const value of Object.values(messages)) if (typeof value === "string") texts.push(value);
    texts.push(messages.signInMessage("invalid-credentials"), messages.retryMessage(90));
    expect(texts.length).toBeGreaterThan(6);
    for (const text of texts) {
      expect(text, text).toMatch(/^[A-Z][^!]*\.$/);
      expect(dashes.test(text), text).toBe(false);
    }
  });
});
