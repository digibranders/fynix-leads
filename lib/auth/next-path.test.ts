import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each(["/", "/welcome", "/client/review", "/client/leads/LD-4K9P?tab=activity", "/agency/leads#top"])("accepts the path %s", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it.each([
    ["another site by scheme", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example"],
    ["a slash and a backslash", "/\\evil.example"],
    ["a backslash anywhere", "/ok\\path"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a relative path", "welcome"],
    ["a control character", "/welcome\r\nSet-Cookie: x=1"],
    ["a tab, which some browsers strip", "/\t/evil.example"],
    ["an empty string", ""],
    ["a path that is too long", `/${"a".repeat(200)}`],
    ["the sign-in page", "/sign-in"],
    ["the reset page with a query", "/reset-password?token=abc"],
    ["the forgot page with a fragment", "/forgot-password#x"],
  ])("refuses %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("refuses a value that is not a string", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath(["/welcome"])).toBeNull();
  });
});
