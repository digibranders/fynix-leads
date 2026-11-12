import { createHash, randomFillSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, isWellFormedInviteToken } from "./invite-token";

const bytes = (count: number): Uint8Array => randomFillSync(new Uint8Array(count));

describe("generateInviteToken", () => {
  it("makes a 43 character base64url token and stores only its SHA-256, also 43 characters", () => {
    const { token, tokenHash } = generateInviteToken(bytes);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("base64url"));
    expect(tokenHash).not.toBe(token);
  });

  it("is different every time", () => {
    expect(new Set(Array.from({ length: 200 }, () => generateInviteToken(bytes).token)).size).toBe(200);
  });

  it("is a pure function of the random bytes, so a test can fix it", () => {
    const fixed = () => Uint8Array.from({ length: 32 }, (_, index) => index);
    expect(generateInviteToken(fixed)).toEqual(generateInviteToken(fixed));
    expect(generateInviteToken(fixed).token).toBe("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
  });

  it("refuses a random source that returns too few bytes", () => {
    expect(() => generateInviteToken(() => new Uint8Array(8))).toThrow(RangeError);
  });
});

describe("hashInviteToken and isWellFormedInviteToken", () => {
  it("hashes the same token to the same value, and different tokens to different values", () => {
    expect(hashInviteToken("a".repeat(43))).toBe(hashInviteToken("a".repeat(43)));
    expect(hashInviteToken("a".repeat(43))).not.toBe(hashInviteToken("b".repeat(43)));
  });

  it.each(["", "short", "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)} `, `${"a".repeat(42)}/`])("does not accept %j as a token", (value) => {
    expect(isWellFormedInviteToken(value)).toBe(false);
  });

  it("accepts a generated token", () => {
    expect(isWellFormedInviteToken(generateInviteToken(bytes).token)).toBe(true);
  });
});
