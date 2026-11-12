import { describe, expect, it } from "vitest";
import { INVITE_LIFETIME_DAYS, inviteExpiry, inviteState } from "./invite-state";

const NOW = new Date("2026-12-01T10:00:00.000Z");
const FUTURE = new Date("2026-12-02T10:00:00.000Z");
const PAST = new Date("2026-11-30T10:00:00.000Z");

describe("inviteExpiry", () => {
  it("is seven days after the invite was issued", () => {
    expect(INVITE_LIFETIME_DAYS).toBe(7);
    expect(inviteExpiry(NOW).toISOString()).toBe("2026-12-08T10:00:00.000Z");
  });
});

describe("inviteState", () => {
  it("is pending before the expiry", () => {
    expect(inviteState({ expiresAt: FUTURE, redeemedAt: null, revokedAt: null }, NOW)).toBe("pending");
  });

  it("is expired at the expiry instant and after it", () => {
    expect(inviteState({ expiresAt: NOW, redeemedAt: null, revokedAt: null }, NOW)).toBe("expired");
    expect(inviteState({ expiresAt: PAST, redeemedAt: null, revokedAt: null }, NOW)).toBe("expired");
  });

  it("is revoked, even when it has also run out", () => {
    expect(inviteState({ expiresAt: PAST, redeemedAt: null, revokedAt: PAST }, NOW)).toBe("revoked");
  });

  it("is redeemed once used, whatever happened after", () => {
    expect(inviteState({ expiresAt: PAST, redeemedAt: PAST, revokedAt: null }, NOW)).toBe("redeemed");
    expect(inviteState({ expiresAt: FUTURE, redeemedAt: PAST, revokedAt: PAST }, NOW)).toBe("redeemed");
  });
});
