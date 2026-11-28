import { qualifyingItemsFor, type QualifyingItem } from "./qualifying-items";
import { htmlToText as richToText } from "./rich-text-view";

/**
 * The checklist an agency ticks when it submits a lead: one check for each qualification criterion the campaign set (decision-maker, industry, market)
 * and one for each qualifying question. It is saved with the lead as it was asked, so a later change to the campaign does not rewrite an old lead.
 */
export type QualificationCheck = {
  readonly kind: "criteria" | "question";
  /** What is checked: "Decision-maker is one of the target titles" or the question. */
  readonly label: string;
  /** What passing looks like: the target values for a criterion, the expected answer for a question. Empty when there is none. */
  readonly expected: string;
  /** Whether the prospect passed it: for a criterion, the agency's tick; for a question, whether the answer is what was hoped for. */
  readonly passed: boolean;
  /** For a question: what the prospect actually said, in the agency's words. A lead sent before answers were asked for has none. */
  readonly answer?: string;
};

export const MAX_QUALIFICATION_CHECKS = 40;

/** The parts of a campaign's brief the checklist is made from. */
export type ChecklistSource = {
  readonly jobTitles: readonly string[];
  readonly industries: readonly string[];
  readonly geography: string;
  readonly qualifyingQuestions: string;
  readonly qualifyingItems: readonly QualifyingItem[];
};

/** The checks a campaign asks for, none of them passed yet. A criterion the campaign did not set is left out. */
export function checklistFor(source: ChecklistSource): QualificationCheck[] {
  const checks: QualificationCheck[] = [];
  if (source.jobTitles.length > 0) checks.push({ kind: "criteria", label: "The prospect is a target decision-maker", expected: source.jobTitles.join(", "), passed: false });
  if (source.industries.length > 0) checks.push({ kind: "criteria", label: "The prospect is in a target industry", expected: source.industries.join(", "), passed: false });
  if (source.geography.trim() !== "") checks.push({ kind: "criteria", label: "The prospect is in a target market", expected: source.geography.trim(), passed: false });
  for (const item of qualifyingItemsFor(source.qualifyingItems, source.qualifyingQuestions)) {
    const label = richToText(item.question);
    // A question starts as meeting the expectation: the agency records what was said, and unticks it when the answer is not what was hoped for.
    if (label !== "") checks.push({ kind: "question", label, expected: richToText(item.answer), passed: true, answer: "" });
  }
  return checks;
}

/** The questions that still have no answer written. A lead cannot be sent while there is one. */
export const unansweredQuestions = (checks: readonly QualificationCheck[]): QualificationCheck[] => checks.filter((check) => check.kind === "question" && (check.answer ?? "").trim() === "");

/** The checks the agency left unticked. */
export const failedChecks = (checks: readonly QualificationCheck[]): QualificationCheck[] => checks.filter((check) => !check.passed);
