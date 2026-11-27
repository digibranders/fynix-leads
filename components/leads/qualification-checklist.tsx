"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { failedChecks, type QualificationCheck } from "@/lib/qualification-checks";

/**
 * The end of the lead form: one tick box for each qualification criterion and qualifying question of the campaign, and a note. A lead with a check
 * left unticked can still be sent, but the note then has to say which check was not passed and why. The checks post as JSON under `qualificationChecks`.
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
  const toggle = (index: number) => onChange(checks.map((check, at) => (at === index ? { ...check, passed: !check.passed } : check)));
  const section = (kind: QualificationCheck["kind"], title: string) => {
    const rows = checks.flatMap((check, index) => (check.kind === kind ? [{ check, index }] : []));
    if (rows.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-label font-semibold text-ink-2">{title}</h3>
        <ul className="flex flex-col gap-2">
          {rows.map(({ check, index }) => (
            <li key={`${check.kind}-${index}`}>
              <label htmlFor={`${base}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-md bg-surface px-3.5 py-3 hover:bg-navy-05">
                <input id={`${base}-${index}`} type="checkbox" checked={check.passed} onChange={() => toggle(index)} className="mt-0.5 size-5 shrink-0 accent-navy" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-row font-medium text-ink">{check.label}</span>
                  {check.expected === "" ? null : (
                    <span className="text-table text-ink-muted">
                      {check.kind === "criteria" ? "Looking for: " : "Expected answer: "}
                      {check.expected}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="qualificationChecks" value={JSON.stringify(checks)} />
      {checks.length === 0 ? <p className="text-label text-ink-muted">This campaign has no criteria or questions to check yet. You can still add a note.</p> : null}
      {section("criteria", "Qualification criteria")}
      {section("question", "Qualifying questions")}
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
