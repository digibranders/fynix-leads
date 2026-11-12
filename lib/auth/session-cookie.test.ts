import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./session-cookie";

const jar = (...names: string[]) => ({ has: (name: string) => names.includes(name) });

describe("hasSessionCookie", () => {
  it("is true for either spelling and false for other cookies", () => {
    expect(hasSessionCookie(jar("fynix-leads.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("__Secure-fynix-leads.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("session", "theme"))).toBe(false);
    expect(hasSessionCookie(jar())).toBe(false);
  });
});
