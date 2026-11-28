"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { failedChecks, unansweredQuestions, type QualificationCheck } from "@/lib/qualification-checks";

/**
 * The end of the lead form. Each qualification criterion is a tick. Each qualifying question has a box for what the prospect said, and a tick for whether
 * that is the answer hoped for, so the client reads the real answer and not only a tick. A check that is not ticked can still be sent, but the note then has
 * to say which and why; a question left without an answer cannot be sent. The checks post as JSON under `qualificationChecks`.
 */
export function QualificationChecklist({
  checks,
  onChange,
  notesDefault,
}: {
  readonly checks: readonly QualificationCheck[];
  readonly onChange: (checks: readonly QualificationCheck[]) => void;
  readonly notesDefault?: string | undefined;
}) {
  const base = useId();
  const failed = failedChecks(checks);
  const unanswered = unansweredQuestions(checks).length;
  const change = (index: number, patch: Partial<QualificationCheck>) => onChange(checks.map((check, at) => (at === index ? { ...check, ...patch } : check)));
  const tick = (index: number, check: QualificationCheck, label: string) => (
    <label className="flex cursor-pointer items-center gap-2.5 text-table text-ink-2">
      <input type="checkbox" checked={check.passed} onChange={() => change(index, { passed: !check.passed })} className="size-5 shrink-0 accent-navy" />
      {label}
    </label>
  );
  const criteria = checks.flatMap((check, index) => (check.kind === "criteria" ? [{ check, index }] : []));
  const questions = checks.flatMap((check, index) => (check.kind === "question" ? [{ check, index }] : []));
  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="qualificationChecks" value={JSON.stringify(checks)} />
      {checks.length === 0 ? <p className="text-label text-ink-muted">This campaign has no criteria or questions to check yet. You can still add a note.</p> : null}

      {criteria.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <h3 className="text-label font-semibold text-ink-2">Qualification criteria</h3>
          <ul className="flex flex-col gap-2">
            {criteria.map(({ check, index }) => (
              <li key={`criteria-${index}`}>
                <label htmlFor={`${base}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-md bg-surface px-3.5 py-3 hover:bg-navy-05">
                  <input id={`${base}-${index}`} type="checkbox" checked={check.passed} onChange={() => change(index, { passed: !check.passed })} className="mt-0.5 size-5 shrink-0 accent-navy" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-row font-medium text-ink">{check.label}</span>
                    {check.expected === "" ? null : <span className="text-table text-ink-muted">{`Looking for: ${check.expected}`}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <h3 className="text-label font-semibold text-ink-2">Qualifying questions</h3>
          <ul className="flex flex-col gap-3">
            {questions.map(({ check, index }, position) => (
              <li key={`question-${index}`} className="flex flex-col gap-2.5 rounded-md bg-surface px-3.5 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-row font-medium text-ink">{`${position + 1}. ${check.label}`}</span>
                  {check.expected === "" ? null : <span className="text-table text-ink-muted">{`Expected answer: ${check.expected}`}</span>}
                </div>
                <Field id={`${base}-answer-${index}`} label="What the prospect said">
                  <Textarea id={`${base}-answer-${index}`} rows={2} value={check.answer ?? ""} onChange={(event) => change(index, { answer: event.target.value })} aria-required="true" />
                </Field>
                {tick(index, check, "Meets the expected answer")}
              </li>
            ))}
          </ul>
          {unanswered > 0 ? <p className="text-caption text-ink-muted">{unanswered === 1 ? "1 question still needs an answer." : `${unanswered} questions still need an answer.`} The lead cannot be sent until each has one.</p> : null}
        </div>
      )}

      <Field
        id={`${base}-notes`}
        label="Notes"
        helper={failed.length > 0 ? `${failed.length === 1 ? "1 check is" : `${failed.length} checks are`} not ticked. Say which ${failed.length === 1 ? "one was" : "ones were"} not passed, and why.` : "Anything the client should know about this prospect."}
      >
        <Textarea id={`${base}-notes`} name="qualificationNotes" rows={3} defaultValue={notesDefault} aria-required={failed.length > 0 ? true : undefined} />
      </Field>
    </div>
  );
}
