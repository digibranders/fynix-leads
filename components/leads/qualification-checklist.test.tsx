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
  it("gives each question a box for what the prospect said and a tick for meeting the expected answer, and asks why for a criterion that is not ticked", () => {
    const html = renderToStaticMarkup(<QualificationChecklist checks={checks} onChange={() => undefined} />);
    expect(html.match(/What the prospect said/g)).toHaveLength(2);
    expect(html.match(/Meets the expected answer/g)).toHaveLength(2);
    expect(html.match(/Why it was not passed/g)).toHaveLength(1);
    expect(html).toContain("The finance director");
    expect(html).toContain("Expected answer: Between 20 and 250");
    expect(html).toContain("Looking for: Logistics");
    expect(html).toContain("2 checks still need an answer or a reason.");
    expect(html).toContain('name="qualificationChecks"');
  });

  it("asks for no reason on a criterion that is ticked, and says nothing about missing words once every check has them", () => {
    const ticked = checks.map((check) => (check.kind === "criteria" ? { ...check, passed: true } : check));
    expect(renderToStaticMarkup(<QualificationChecklist checks={ticked} onChange={() => undefined} />)).not.toContain("Why it was not passed");
    const complete = checks.map((check) => ({ ...check, answer: "Written" }));
    expect(renderToStaticMarkup(<QualificationChecklist checks={complete} onChange={() => undefined} />)).not.toContain("still need");
  });

  it("keeps the general note optional", () => {
    const html = renderToStaticMarkup(<QualificationChecklist checks={checks} onChange={() => undefined} />);
    expect(html).toContain("Other notes");
    expect(html).toContain("Optional.");
  });
});

describe("QualificationChecklistView", () => {
  it("shows what the prospect said beside what was expected", () => {
    const html = renderToStaticMarkup(<QualificationChecklistView checks={checks} notes="" />);
    expect(html).toContain("Prospect said: The finance director");
    expect(html).toContain("Expected: Between 20 and 250");
    expect(html).not.toContain("Prospect said: undefined");
  });

  it("shows why a criterion was not passed, and nothing for one that was", () => {
    const html = renderToStaticMarkup(
      <QualificationChecklistView
        checks={[
          { kind: "criteria", label: "In a target industry", expected: "Logistics", passed: false, answer: "They are in retail" },
          { kind: "criteria", label: "In a target market", expected: "UK", passed: true, answer: "left over from an earlier untick" },
        ]}
        notes=""
      />,
    );
    expect(html).toContain("Not passed because: They are in retail");
    expect(html).not.toContain("left over");
  });
});
