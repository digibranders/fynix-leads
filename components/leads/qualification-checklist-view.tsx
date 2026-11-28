import { CheckCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { QualificationCheck } from "@/lib/qualification-checks";

/** The checklist an agency ticked when it sent a lead, read only, with its note. Nothing is shown for a lead sent before checklists existed. */
export function QualificationChecklistView({ checks, notes }: { readonly checks: readonly QualificationCheck[]; readonly notes: string }) {
  if (checks.length === 0 && notes.trim() === "") return null;
  const passed = checks.filter((check) => check.passed).length;
  return (
    <div className="flex flex-col gap-3">
      {checks.length > 0 ? (
        <>
          <p className="text-label font-semibold text-ink-2">{`${passed} of ${checks.length} checks passed`}</p>
          <ul className="flex flex-col gap-1.5">
            {checks.map((check, index) => (
              <li key={`${check.kind}-${index}`} className="flex items-start gap-2.5 rounded-md bg-surface px-3 py-2.5">
                {check.passed ? <CheckCircle aria-hidden weight="fill" size={18} className="mt-0.5 shrink-0 text-green-text" /> : <XCircle aria-hidden weight="fill" size={18} className="mt-0.5 shrink-0 text-red-text" />}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-table font-medium text-ink">
                    {check.label}
                    <span className="sr-only">{check.passed ? ", passed" : ", not passed"}</span>
                  </span>
                  {check.kind === "question" && (check.answer ?? "").trim() !== "" ? <span className="whitespace-pre-line text-table text-ink">{`Prospect said: ${check.answer}`}</span> : null}
                  {check.expected === "" ? null : <span className="text-caption text-ink-muted">{check.kind === "question" ? `Expected: ${check.expected}` : check.expected}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {notes.trim() === "" ? null : (
        <div>
          <p className="text-caption font-semibold text-ink-muted">Agency notes</p>
          <p className="whitespace-pre-line text-table text-ink">{notes}</p>
        </div>
      )}
    </div>
  );
}
