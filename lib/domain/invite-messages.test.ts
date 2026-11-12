import { describe, expect, it } from "vitest";
import { ACCOUNT_EXISTS, INVITE_ACCEPTED_NOTICE, TERMS_CHANGED, TERMS_NOT_ACCEPTED, unavailableMessage, type InviteUnavailableReason } from "./invite-messages";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("invite messages", () => {
  it.each(["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[])("%s: has its own sentence, says what to do and names nobody", (reason) => {
    const message = unavailableMessage(reason);
    expect(message.length).toBeGreaterThan(20);
    expect(message).toMatch(/[Aa]sk Fynix|Sign in instead/);
    expect(message).not.toMatch(/@/);
  });

  it("gives every reason a different sentence", () => {
    const messages = (["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[]).map(unavailableMessage);
    expect(new Set(messages).size).toBe(4);
  });

  it("uses sentence case, no exclamation marks and no em or en dashes anywhere", () => {
    const all = [...(["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[]).map(unavailableMessage), TERMS_NOT_ACCEPTED, TERMS_CHANGED, ACCOUNT_EXISTS, INVITE_ACCEPTED_NOTICE];
    for (const message of all) {
      expect(DASHES.test(message), message).toBe(false);
      expect(message, message).not.toContain("!");
      expect(message, message).toMatch(/^[A-Z]/);
    }
  });
});
