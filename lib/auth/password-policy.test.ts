import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE, passwordProblem } from "./password-policy";

const MISSING_KIND = "Include at least one letter, one number and one special character.";

describe("passwordProblem", () => {
  it("states a minimum of 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("accepts a password at exactly the minimum and exactly the maximum when it has a letter, a number and a special character", () => {
    expect(passwordProblem("abcde1!x")).toBeNull();
    expect(passwordProblem(`a1!${"b".repeat(PASSWORD_MAX_LENGTH - 3)}`)).toBeNull();
  });

  it("refuses one character under the minimum and one over the maximum, and says how many to use", () => {
    expect(passwordProblem("abcd1!x")).toBe("Use at least 8 characters.");
    expect(passwordProblem(`a1!${"b".repeat(PASSWORD_MAX_LENGTH - 2)}`)).toBe("Use at most 128 characters.");
    expect(passwordProblem("")).toBe("Use at least 8 characters.");
  });

  it.each([
    ["no letter", "12345678!"],
    ["no number", "abcdefgh!"],
    ["no special character", "abcdefg12"],
    ["only a space as the extra character", "abcdefg1 "],
    ["letters and numbers only, in another script", "паролі123"],
  ])("refuses a long enough password with %s", (_label, password) => {
    expect(passwordProblem(password)).toBe(MISSING_KIND);
  });

  it("counts a letter, a number and a symbol from any script", () => {
    expect(passwordProblem("пароль1#")).toBeNull();
  });

  it("states the same rule in the hint", () => {
    expect(PASSWORD_RULE).toContain("8 characters");
    expect(PASSWORD_RULE).toContain("letter");
    expect(PASSWORD_RULE).toContain("number");
    expect(PASSWORD_RULE).toContain("special character");
  });
});
