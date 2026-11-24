import { describe, expect, it } from "vitest";
import { challengeFrom, cleanCode, fynixSecondFactorRequired, secondFactorPending, secretFromUri } from "@/server/auth/second-factor";

describe("secondFactorPending", () => {
  const on = { REQUIRE_FYNIX_2FA: "true" };
  it("is true only for a Fynix person without the step while the rule is on", () => {
    expect(secondFactorPending({ kind: "fynix", twoFactorEnabled: false }, on)).toBe(true);
    expect(secondFactorPending({ kind: "fynix" }, on)).toBe(true);
    expect(secondFactorPending({ kind: "fynix", twoFactorEnabled: true }, on)).toBe(false);
  });
  it("is false for a client or an agency user whatever the rule says", () => {
    expect(secondFactorPending({ kind: "client", twoFactorEnabled: false }, on)).toBe(false);
    expect(secondFactorPending({ kind: "agency", twoFactorEnabled: false }, on)).toBe(false);
  });
  it("is false while the rule is off, which is the default", () => {
    expect(secondFactorPending({ kind: "fynix", twoFactorEnabled: false }, {})).toBe(false);
    expect(fynixSecondFactorRequired({ REQUIRE_FYNIX_2FA: "false" })).toBe(false);
    expect(fynixSecondFactorRequired({ REQUIRE_FYNIX_2FA: "True" })).toBe(false);
  });
});

describe("the small parsers", () => {
  it("reads the secret out of an authenticator address, and refuses one without", () => {
    expect(secretFromUri("otpauth://totp/Fynix%20Leads:a%40b.example?secret=JBSWY3DPEHPK3PXP&issuer=Fynix%20Leads&digits=6&period=30")).toBe("JBSWY3DPEHPK3PXP");
    expect(() => secretFromUri("otpauth://totp/x?issuer=y")).toThrow();
  });
  it("finds the challenge cookie with or without the secure prefix, and nothing else", () => {
    expect(challengeFrom(new Headers({ cookie: "a=1; fynix-leads.two_factor=abc.def; b=2" }))).toBe("abc.def");
    expect(challengeFrom(new Headers({ cookie: "__Secure-fynix-leads.two_factor=xyz" }))).toBe("xyz");
    expect(challengeFrom(new Headers({ cookie: "fynix-leads.session_token=s" }))).toBeNull();
    expect(challengeFrom(new Headers())).toBeNull();
  });
  it("strips spaces from a typed code", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
  });
});
