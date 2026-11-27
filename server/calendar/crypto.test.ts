import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, pkcePair, signValue, tokenKey, verifyValue } from "./crypto";

const key = randomBytes(32);

describe("encrypting a refresh token", () => {
  it("round trips, and never stores the token in the clear", () => {
    const stored = encryptToken("1//refresh-token-value", key);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("refresh-token-value");
    expect(decryptToken(stored, key)).toBe("1//refresh-token-value");
  });
  it("makes a different value every time, so equal tokens do not look equal", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });
  it("refuses a value that was changed, made with another key, or is not ours", () => {
    const stored = encryptToken("secret", key);
    const [version, iv, tag, body] = stored.split(".");
    const flipped = `${version}.${iv}.${tag}.${Buffer.from("x").toString("base64url")}${body}`;
    expect(() => decryptToken(flipped, key)).toThrow();
    expect(() => decryptToken(stored, randomBytes(32))).toThrow();
    expect(() => decryptToken("plain text", key)).toThrow();
    expect(() => decryptToken(stored.replace("v1.", "v9."), key)).toThrow();
  });
});

describe("the key", () => {
  it("is 32 bytes of base64 or base64url, and the error names the variable, not the value", () => {
    expect(tokenKey(randomBytes(32).toString("base64")).length).toBe(32);
    expect(tokenKey(randomBytes(32).toString("base64url")).length).toBe(32);
    expect(() => tokenKey(undefined)).toThrow("CALENDAR_TOKEN_KEY");
    expect(() => tokenKey(randomBytes(16).toString("base64url"))).toThrow("32 bytes");
  });
});

describe("PKCE and signed values", () => {
  it("gives a challenge that is the S256 of the verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(pkcePair().verifier).not.toBe(verifier);
  });
  it("accepts what it signed and nothing else", () => {
    const signed = signValue({ a: 1 }, key);
    expect(verifyValue(signed, key)).toEqual({ a: 1 });
    expect(verifyValue(signed, randomBytes(32))).toBeNull();
    const [body, signature] = signed.split(".");
    expect(verifyValue(`${Buffer.from('{"a":2}').toString("base64url")}.${signature}`, key)).toBeNull();
    expect(verifyValue(`${body}`, key)).toBeNull();
    expect(verifyValue("", key)).toBeNull();
  });
});
