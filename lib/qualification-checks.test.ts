import { describe, expect, it } from "vitest";
import { checklistFor, failedChecks, unexplainedChecks } from "./qualification-checks";

const source = { jobTitles: ["COO", "Head of Operations"], industries: ["Grocery"], geography: "UK, Netherlands", qualifyingQuestions: "", qualifyingItems: [] };

describe("checklistFor", () => {
  it("makes one check for each criterion the campaign set and each question: criteria start unticked, questions start as meeting the expectation with no answer", () => {
    const checks = checklistFor({ ...source, qualifyingItems: [{ question: "<p>Do you own a depot?</p>", answer: "<p>Yes, ideally</p>" }, { question: "<p>How many vans?</p>", answer: "" }] });
    expect(checks.map((check) => [check.kind, check.label, check.expected, check.passed])).toEqual([
      ["criteria", "The prospect is a target decision-maker", "COO, Head of Operations", false],
      ["criteria", "The prospect is in a target industry", "Grocery", false],
      ["criteria", "The prospect is in a target market", "UK, Netherlands", false],
      ["question", "Do you own a depot?", "Yes, ideally", true],
      ["question", "How many vans?", "", true],
    ]);
  });
  it("leaves out a criterion the campaign did not set, and falls back to the old question text", () => {
    const checks = checklistFor({ jobTitles: [], industries: [], geography: " ", qualifyingQuestions: "First?\n\nSecond?", qualifyingItems: [] });
    expect(checks.map((check) => check.label)).toEqual(["First?", "Second?"]);
  });
  it("lists the checks that still need words: every question, and every criterion that is not ticked", () => {
    const checks = checklistFor({ ...source, qualifyingItems: [{ question: "<p>Do you own a depot?</p>", answer: "" }, { question: "<p>How many vans?</p>", answer: "" }] });
    // three criteria (unticked) and two questions: all five need words.
    expect(unexplainedChecks(checks)).toHaveLength(5);
    const ticked = checks.map((check) => (check.kind === "criteria" ? { ...check, passed: true } : check));
    expect(unexplainedChecks(ticked)).toHaveLength(2);
    expect(unexplainedChecks(ticked.map((check) => (check.label === "How many vans?" ? { ...check, answer: "  About 40  " } : check)))).toHaveLength(1);
    expect(unexplainedChecks(ticked.map((check) => ({ ...check, answer: "A depot" })))).toHaveLength(0);
    // an unticked criterion with a reason is complete, and a question that failed is complete once it has its answer.
    expect(unexplainedChecks(checks.map((check) => ({ ...check, answer: "Written" })))).toHaveLength(0);
  });
  it("lists the unticked checks", () => {
    const checks = checklistFor({ ...source, qualifyingItems: [{ question: "<p>Q?</p>", answer: "" }] }).map((check, index) => ({ ...check, passed: index === 0 }));
    // three criteria and one question, the first ticked

    expect(failedChecks(checks)).toHaveLength(3);
  });
});
