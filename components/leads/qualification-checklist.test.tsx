import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QualificationChecklist } from "./qualification-checklist";
import { QualificationChecklistView } from "./qualification-checklist-view";
import type { QualificationCheck } from "@/lib/qualification-checks";

const checks: QualificationCheck[] = [
  { kind: "criteria", label: "The prospect is in a target industry", expected: "Logistics", passed: false },
  { kind: "question", label: "How many vehicles do you run?", expected: "Between 20 and 250", passed: true, answer: "" },
  { kind: "question", label: "Who signs off?", expected: "", passed: true, answer: "The finance director" },
];

describe("QualificationChecklist", () => {
  it("gives each question a box for what the prospect said and a tick for meeting the expected answer, and a criterion a tick only", () => {
    const html = renderToStaticMarkup(<QualificationChecklist checks={checks} onChange={() => undefined} />);
    expect(html.match(/What the prospect said/g)).toHaveLength(2);
    expect(html.match(/Meets the expected answer/g)).toHaveLength(2);
    expect(html).toContain("The finance director");
    expect(html).toContain("Expected answer: Between 20 and 250");
    expect(html).toContain("Looking for: Logistics");
    expect(html).toContain("1 question still needs an answer.");
    expect(html).toContain('name="qualificationChecks"');
  });

  it("says nothing about missing answers once every question has one", () => {
    const answered = checks.map((check) => ({ ...check, answer: check.kind === "question" ? "Answered" : undefined }));
    expect(renderToStaticMarkup(<QualificationChecklist checks={answered} onChange={() => undefined} />)).not.toContain("still needs an answer");
  });
});

describe("QualificationChecklistView", () => {
  it("shows what the prospect said beside what was expected", () => {
    const html = renderToStaticMarkup(<QualificationChecklistView checks={checks} notes="" />);
    expect(html).toContain("Prospect said: The finance director");
    expect(html).toContain("Expected: Between 20 and 250");
    expect(html).not.toContain("Prospect said: undefined");
  });
});
