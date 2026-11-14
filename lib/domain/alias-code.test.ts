import { describe, expect, it } from "vitest";
import { generateVerificationCode, hashVerificationCode } from "./alias-code";

describe("generateVerificationCode", () => {
  it("generates a 6-digit code with its SHA-256 hash", () => {
    const bytes = () => Uint8Array.from([12, 34, 56, 78]);
    const { code, codeHash } = generateVerificationCode(bytes);
    expect(code).toMatch(/^\d{6}$/);
    expect(codeHash).toBe(hashVerificationCode(code));
  });

  it("pads single digit numbers to 6 digits", () => {
    const bytes = () => Uint8Array.from([5, 0, 0, 0]);
    const { code } = generateVerificationCode(bytes);
    expect(code).toBe("000005");
  });
});
