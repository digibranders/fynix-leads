import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signValue } from "./crypto";
import { OAUTH_COOKIE, clearedStateCookie, newOAuthState, readStateCookie, stateCookie } from "./oauth";

const key = randomBytes(32);
const now = new Date("2026-12-01T10:00:00Z");
const valueOf = (cookie: string) => cookie.slice(OAUTH_COOKIE.length + 1).split(";")[0] ?? "";

describe("the sign-in state cookie", () => {
  it("is signed, not readable by scripts, only sent to the calendar routes, and Secure on https", () => {
    const { state } = newOAuthState("google", "user-1", now);
    const cookie = stateCookie(state, key, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/calendar");
    expect(cookie).toContain("Secure");
    expect(stateCookie(state, key, false)).not.toContain("Secure");
    expect(clearedStateCookie(false)).toContain("Max-Age=0");
  });
  it("is read back for ten minutes, then not", () => {
    const { state } = newOAuthState("microsoft", "user-1", now);
    const value = valueOf(stateCookie(state, key, false));
    expect(readStateCookie(value, key, new Date(now.getTime() + 9 * 60_000))).toMatchObject({ provider: "microsoft", userId: "user-1", state: state.state });
    expect(readStateCookie(value, key, new Date(now.getTime() + 11 * 60_000))).toBeNull();
  });
  it("is refused when missing, changed, made with another key or the wrong shape", () => {
    const { state } = newOAuthState("google", "user-1", now);
    const value = valueOf(stateCookie(state, key, false));
    expect(readStateCookie(undefined, key, now)).toBeNull();
    expect(readStateCookie(value, randomBytes(32), now)).toBeNull();
    expect(readStateCookie(`${value}x`, key, now)).toBeNull();
    expect(readStateCookie(signValue({ state: "short" }, key), key, now)).toBeNull();
  });
  it("gives each sign-in its own state and verifier", () => {
    expect(newOAuthState("google", "u", now).state.state).not.toBe(newOAuthState("google", "u", now).state.state);
  });
});
