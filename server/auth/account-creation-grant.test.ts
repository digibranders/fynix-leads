import { describe, expect, it } from "vitest";
import { hasAccountCreationGrant, withAccountCreationGrant } from "./account-creation-grant";

describe("withAccountCreationGrant", () => {
  it("grants only the exact address, case and spaces aside", async () => {
    await withAccountCreationGrant("  Priya@Example.com ", async () => {
      expect(hasAccountCreationGrant("priya@example.com")).toBe(true);
      expect(hasAccountCreationGrant("PRIYA@EXAMPLE.COM")).toBe(true);
      expect(hasAccountCreationGrant("someone-else@example.com")).toBe(false);
      expect(hasAccountCreationGrant("priya@example.com.evil.test")).toBe(false);
    });
  });

  it("grants nothing outside the callback, before or after", async () => {
    expect(hasAccountCreationGrant("priya@example.com")).toBe(false);
    await withAccountCreationGrant("priya@example.com", async () => undefined);
    expect(hasAccountCreationGrant("priya@example.com")).toBe(false);
  });

  it("does not leak into a concurrent callback for another address", async () => {
    const seen: boolean[] = [];
    await Promise.all([
      withAccountCreationGrant("a@example.com", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seen.push(hasAccountCreationGrant("b@example.com"));
      }),
      withAccountCreationGrant("b@example.com", async () => {
        seen.push(hasAccountCreationGrant("b@example.com"));
      }),
    ]);
    expect(seen.sort()).toEqual([false, true]);
  });

  it("rejects a malformed address and a lookalike that only becomes valid when lower-cased", async () => {
    await expect(withAccountCreationGrant("not-an-email", async () => undefined)).rejects.toThrow("valid email address");
    // The Kelvin sign lower-cases to a plain k, so checking the lowered text would accept it. Built from its code point.
    await expect(withAccountCreationGrant(`${String.fromCharCode(0x212a)}elvin@example.com`, async () => undefined)).rejects.toThrow("valid email address");
  });
});
