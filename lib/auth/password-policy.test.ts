import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE, passwordLengthProblem } from "./password-policy";

describe("passwordLengthProblem", () => {
  it("accepts exactly the minimum and exactly the maximum", () => {
    expect(passwordLengthProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordLengthProblem("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });

  it("refuses one character under the minimum and one over the maximum, and says how many to use", () => {
    expect(passwordLengthProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("Use at least 12 characters.");
    expect(passwordLengthProblem("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("Use at most 128 characters.");
    expect(passwordLengthProblem("")).toBe("Use at least 12 characters.");
  });

  it("states the same minimum in the hint", () => {
    expect(PASSWORD_RULE).toContain(String(PASSWORD_MIN_LENGTH));
  });
});
