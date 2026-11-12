import { describe, expect, it } from "vitest";
import { PLACEHOLDER_NOTICE, PLACEHOLDER_TERMS } from "./placeholder";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("the placeholder terms", () => {
  it.each(["client", "agency", "fynix"] as const)("%s: say in the title and the first line that they are placeholder text", (party) => {
    const { title, body } = PLACEHOLDER_TERMS[party];
    expect(title).toContain("PLACEHOLDER");
    expect(body.split("\n")[0]).toContain("PLACEHOLDER");
  });

  it("carry the non-circumvention and non-solicitation clauses the spec asks for, for the two outside parties", () => {
    for (const party of ["client", "agency"] as const) {
      expect(PLACEHOLDER_TERMS[party].body).toContain("Non-circumvention");
      expect(PLACEHOLDER_TERMS[party].body).toContain("Non-solicitation");
    }
  });

  it("tell the agency to join meetings under its alias", () => {
    expect(PLACEHOLDER_TERMS.agency.body).toContain("Fynix alias");
  });

  it("use no em or en dashes and no exclamation marks, and the notice says who replaces them and when", () => {
    for (const { title, body } of Object.values(PLACEHOLDER_TERMS)) {
      expect(DASHES.test(title + body)).toBe(false);
      expect(title + body).not.toContain("!");
    }
    expect(PLACEHOLDER_NOTICE).toContain("lawyer-approved");
    expect(PLACEHOLDER_NOTICE).toContain("before real users are invited");
  });
});
