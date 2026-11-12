import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds, sessionTooOld } from "./session-lifetime";

describe("session lifetimes", () => {
  it("are 14 days for client and agency, 12 hours for Fynix, and a reset link lasts one hour", () => {
    expect(SESSION_LIFETIME_SECONDS).toEqual({ fynix: 43_200, client: 1_209_600, agency: 1_209_600 });
    expect(sessionLifetimeSeconds("fynix")).toBe(43_200);
    expect(PASSWORD_RESET_LIFETIME_SECONDS).toBe(3_600);
  });
});

describe("sessionTooOld", () => {
  const start = new Date("2026-12-01T09:00:00Z");
  const after = (seconds: number): Date => new Date(start.getTime() + seconds * 1000);

  it("is false just before the lifetime and true at it, for each kind", () => {
    expect(sessionTooOld("fynix", start, after(43_199))).toBe(false);
    expect(sessionTooOld("fynix", start, after(43_200))).toBe(true);
    expect(sessionTooOld("client", start, after(1_209_599))).toBe(false);
    expect(sessionTooOld("agency", start, after(1_209_600))).toBe(true);
  });

  it("treats a Fynix session as old after 13 hours although a client session of that age is fine", () => {
    expect(sessionTooOld("fynix", start, after(13 * 3600))).toBe(true);
    expect(sessionTooOld("client", start, after(13 * 3600))).toBe(false);
  });
});
