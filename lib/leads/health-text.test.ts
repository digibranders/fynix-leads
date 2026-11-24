import { describe, expect, it } from "vitest";
import { ageText, deliveredText } from "./health-text";

describe("pipeline health text", () => {
  it("reads hours under two days and days after", () => {
    expect(ageText(0)).toBe("0h");
    expect(ageText(47)).toBe("47h");
    expect(ageText(48)).toBe("2d");
    expect(ageText(130)).toBe("5d");
  });
  it("reads delivered against a target, or alone", () => {
    expect(deliveredText(4, 8)).toBe("4 of 8");
    expect(deliveredText(3, 0)).toBe("3");
  });
});
