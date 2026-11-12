import { describe, expect, it } from "vitest";
import { inviteLookupChecks, inviteRedeemChecks, resetCompleteChecks, resetRequestChecks, retryMessage, signInChecks } from "./rate-limit-rules";

describe("signInChecks", () => {
  const checks = signInChecks("a@example.com", "203.0.113.9");

  it("checks the network, then the account on that network, then the account, in that order", () => {
    expect(checks.map((check) => check.key)).toEqual([
      "sign-in:network:203.0.113.9",
      "sign-in:account-network:a@example.com:203.0.113.9",
      "sign-in:account:a@example.com",
    ]);
  });

  it("holds the account on one network to a tighter budget than the network, and the account overall to a higher ceiling", () => {
    const [network, accountNetwork, account] = checks;
    expect(accountNetwork?.rule.limit).toBeLessThan(network?.rule.limit ?? 0);
    expect(account?.rule.limit).toBeGreaterThan(network?.rule.limit ?? 0);
    expect(checks.every((check) => check.rule.windowSeconds === 900)).toBe(true);
  });
});

describe("resetRequestChecks and resetCompleteChecks", () => {
  it("limit an account to three reset emails an hour, and a network to ten", () => {
    const [network, account] = resetRequestChecks("a@example.com", "203.0.113.9");
    expect(network?.rule).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(account?.rule).toEqual({ limit: 3, windowSeconds: 3600 });
  });

  it("limit token attempts per network", () => {
    expect(resetCompleteChecks("203.0.113.9")).toEqual([{ key: "reset-complete:network:203.0.113.9", rule: { limit: 20, windowSeconds: 3600 } }]);
  });

  it("use different keys for different actions, so one budget cannot be spent on another", () => {
    const keys = [...signInChecks("a@example.com", "x"), ...resetRequestChecks("a@example.com", "x"), ...resetCompleteChecks("x")].map((check) => check.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("inviteLookupChecks and inviteRedeemChecks", () => {
  it("limit a network's lookups, and a network's and an invite's redemptions, each under its own key", () => {
    expect(inviteLookupChecks("203.0.113.9")).toEqual([{ key: "invite-lookup:network:203.0.113.9", rule: { limit: 30, windowSeconds: 900 } }]);
    const [network, token] = inviteRedeemChecks("HASH", "203.0.113.9");
    expect(network).toEqual({ key: "invite-redeem:network:203.0.113.9", rule: { limit: 10, windowSeconds: 3600 } });
    expect(token).toEqual({ key: "invite-redeem:token:HASH", rule: { limit: 10, windowSeconds: 3600 } });
  });

  it("do not share a budget with sign-in or reset", () => {
    const keys = [...signInChecks("a@example.com", "x"), ...resetRequestChecks("a@example.com", "x"), ...resetCompleteChecks("x"), ...inviteLookupChecks("x"), ...inviteRedeemChecks("h", "x")].map((check) => check.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes and never says 0", () => {
    expect(retryMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
    expect(retryMessage(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(retryMessage(0)).toBe("Too many attempts. Try again in 1 minute.");
  });
});
