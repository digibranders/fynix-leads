import { describe, expect, it } from "vitest";
import { checklistFor, failedChecks } from "./qualification-checks";

const source = { jobTitles: ["COO", "Head of Operations"], industries: ["Grocery"], geography: "UK, Netherlands", qualifyingQuestions: "", qualifyingItems: [] };

describe("checklistFor", () => {
  it("makes one check for each criterion the campaign set and each question, none passed", () => {
    const checks = checklistFor({ ...source, qualifyingItems: [{ question: "<p>Do you own a depot?</p>", answer: "<p>Yes, ideally</p>" }, { question: "<p>How many vans?</p>", answer: "" }] });
    expect(checks.map((check) => [check.kind, check.label, check.expected, check.passed])).toEqual([
      ["criteria", "The prospect is a target decision-maker", "COO, Head of Operations", false],
      ["criteria", "The prospect is in a target industry", "Grocery", false],
      ["criteria", "The prospect is in a target market", "UK, Netherlands", false],
      ["question", "Do you own a depot?", "Yes, ideally", false],
      ["question", "How many vans?", "", false],
    ]);
  });
  it("leaves out a criterion the campaign did not set, and falls back to the old question text", () => {
    const checks = checklistFor({ jobTitles: [], industries: [], geography: " ", qualifyingQuestions: "First?\n\nSecond?", qualifyingItems: [] });
    expect(checks.map((check) => check.label)).toEqual(["First?", "Second?"]);
  });
  it("lists the unticked checks", () => {
    const checks = checklistFor(source).map((check, index) => ({ ...check, passed: index === 0 }));
    expect(failedChecks(checks)).toHaveLength(2);
  });
});
