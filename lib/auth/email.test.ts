import { describe, expect, it } from "vitest";
import { normaliseEmail } from "./email";

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    expect(normaliseEmail("  Priya.Sharma@Example.COM \n")).toBe("priya.sharma@example.com");
  });
});
