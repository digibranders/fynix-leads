"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { unexplainedChecks, type QualificationCheck } from "@/lib/qualification-checks";

/**
 * The end of the lead form. Each qualification criterion is a tick, and a box appears under it for why it was not passed when it is not ticked. Each qualifying
 * question has a box for what the prospect said, and a tick for whether that is the answer hoped for. So the client reads the words beside each check, and not
 * only a tick. A lead can be sent with checks not passed, but not while a question has no answer or an unticked criterion has no reason. The general note is
 * optional. The checks post as JSON under `qualificationChecks`.
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
  const missing = unexplainedChecks(checks).length;
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
              <li key={`criteria-${index}`} className="flex flex-col gap-2.5 rounded-md bg-surface px-3.5 py-3">
                <label htmlFor={`${base}-${index}`} className="flex cursor-pointer items-start gap-3">
                  <input id={`${base}-${index}`} type="checkbox" checked={check.passed} onChange={() => change(index, { passed: !check.passed })} className="mt-0.5 size-5 shrink-0 accent-navy" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-row font-medium text-ink">{check.label}</span>
                    {check.expected === "" ? null : <span className="text-table text-ink-muted">{`Looking for: ${check.expected}`}</span>}
                  </span>
                </label>
                {check.passed ? null : (
                  <Field id={`${base}-reason-${index}`} label="Why it was not passed">
                    <Textarea id={`${base}-reason-${index}`} rows={1} className="min-h-0 resize-none overflow-hidden" value={check.answer ?? ""} onChange={(event) => change(index, { answer: event.target.value })} aria-required="true" />
                  </Field>
                )}
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
                  <Textarea id={`${base}-answer-${index}`} rows={1} className="min-h-0 resize-none overflow-hidden" value={check.answer ?? ""} onChange={(event) => change(index, { answer: event.target.value })} aria-required="true" />
                </Field>
                {tick(index, check, "Meets the expected answer")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing > 0 ? <p className="text-caption text-ink-muted">{missing === 1 ? "1 check still needs an answer or a reason." : `${missing} checks still need an answer or a reason.`} The lead cannot be sent until each has one.</p> : null}

      <Field id={`${base}-notes`} label="Other notes" helper="Optional. Anything else the client should know about this prospect.">
        <Textarea id={`${base}-notes`} name="qualificationNotes" rows={3} defaultValue={notesDefault} />
      </Field>
    </div>
  );
}
