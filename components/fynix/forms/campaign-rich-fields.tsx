"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_QUALIFYING_ITEMS, qualifyingItemsFor, type QualifyingItem } from "@/lib/qualifying-items";
import { isHtmlEmpty } from "@/lib/rich-text-view";
import { useFormState } from "./action-form";
import { FormGroup } from "./form-parts";
import { PasteButton, QuestionsPasteDialog, SectionsPasteDialog, type SectionTarget } from "./paste-dialog";
import { RichEditor, RichField } from "./rich-editor";
import { TagInput } from "./tag-input";

/** What the three tabs that take long or listed answers need from a campaign. A campaign being created has none. */
export type RichBrief = {
  readonly pitchIntroduction: string;
  readonly pitchServices: string;
  readonly pitchDifferentiator: string;
  readonly pitchCollaterals: string;
  readonly pitchCaseStudies: string;
  readonly qualifyingQuestions: string;
  readonly qualifyingItems: readonly QualifyingItem[];
  readonly geography: string;
  readonly industries: readonly string[];
  readonly jobTitles: readonly string[];
};

function PasteBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">{children}</div>;
}

// ---- Brand and service information ------------------------------------------------------------------------------------------------------

type BrandKey = "pitchIntroduction" | "pitchServices" | "pitchDifferentiator" | "pitchCollaterals" | "pitchCaseStudies";

const BRAND: readonly (SectionTarget<BrandKey> & { readonly question: string; readonly helper?: string })[] = [
  { key: "pitchIntroduction", label: "Brand introduction", question: "How do you introduce your brand to prospects?", test: /introduc|who (we|you) are|about (us|the (brand|company))/i },
  { key: "pitchServices", label: "Services", question: "What services do you offer?", test: /service|offer|what (do )?(we|you) (sell|do)/i },
  { key: "pitchDifferentiator", label: "Key differentiator (USP)", question: "What is your key differentiating factor (USP)?", test: /differenti|usp|unique|sets? .*apart|why (us|choose)/i },
  { key: "pitchCollaterals", label: "Marketing collaterals", question: "What marketing collaterals are available?", helper: "Paste links or describe them.", test: /collateral|brochure|deck|marketing material/i },
  { key: "pitchCaseStudies", label: "Case studies", question: "Are there any case studies or success stories?", test: /case stud|success stor|testimonial/i },
];

/**
 * The five answers about the brand, each a rich text box, with one "Paste from Word" for a whole document: it is split by its headings into the
 * five boxes, and the person moves any part to another box (or leaves it out) before it is used.
 */
export function BrandFields({ brief }: { brief: RichBrief | null }) {
  const [values, setValues] = useState<Readonly<Record<BrandKey, string>>>({
    pitchIntroduction: brief?.pitchIntroduction ?? "",
    pitchServices: brief?.pitchServices ?? "",
    pitchDifferentiator: brief?.pitchDifferentiator ?? "",
    pitchCollaterals: brief?.pitchCollaterals ?? "",
    pitchCaseStudies: brief?.pitchCaseStudies ?? "",
  });
  const [pasting, setPasting] = useState(false);
  return (
    <FormGroup title="Brand and service information">
      <PasteBar>
        <p className="text-caption text-ink-muted">Type, or paste a whole document from Word. Bold, lists and links are kept.</p>
        <PasteButton onClick={() => setPasting(true)} />
      </PasteBar>
      {BRAND.map((entry) => (
        <div key={entry.key} className="md:col-span-2">
          <RichField
            name={entry.key}
            label={entry.question}
            {...(entry.helper === undefined ? {} : { helper: entry.helper })}
            value={values[entry.key]}
            onChange={(html) => setValues((current) => ({ ...current, [entry.key]: html }))}
          />
        </div>
      ))}
      <SectionsPasteDialog
        open={pasting}
        onOpenChange={setPasting}
        kind="rich"
        title="Paste brand and service information"
        description="A document with a heading for each answer, such as Services or Case studies, is split into the boxes. Anything that does not match a heading you can place yourself."
        targets={BRAND}
        onApply={(assigned) =>
          setValues((current) => {
            const next = { ...current };
            for (const entry of BRAND) {
              const added = assigned[entry.key];
              if (added !== undefined) next[entry.key] = isHtmlEmpty(current[entry.key]) ? added : `${current[entry.key]}${added}`;
            }
            return next;
          })
        }
      />
    </FormGroup>
  );
}

// ---- Qualification criteria ---------------------------------------------------------------------------------------------------------------

type CriteriaKey = "jobTitles" | "industries" | "geography";

const CRITERIA: readonly (SectionTarget<CriteriaKey> & { readonly helper?: string; readonly list?: boolean; readonly placeholder?: string })[] = [
  { key: "jobTitles", label: "Target decision-makers", helper: "Job titles. Type one and press Enter to add it.", list: true, placeholder: "For example: Head of Marketing", test: /decision|job title|titles|roles?\b|persona/i },
  { key: "industries", label: "Target industries", helper: "Type one and press Enter to add it.", list: true, placeholder: "For example: Logistics", test: /industr|sector|vertical/i },
  { key: "geography", label: "Target geographical markets", test: /geograph|market|region|countr|location/i },
];

const splitValues = (text: string): string[] => text.split(",").map((value) => value.trim()).filter((value) => value !== "");

/** Merges new values into a comma separated box without repeating one that is already there. */
function mergeValues(current: string, added: readonly string[]): string {
  const seen = new Set<string>();
  return [...splitValues(current), ...added]
    .filter((value) => (seen.has(value.toLowerCase()) ? false : (seen.add(value.toLowerCase()), true)))
    .join(", ");
}

/** Who the campaign aims at: three short boxes, filled by hand or by pasting a list from Word (each part becomes comma separated values). */
export function QualificationFields({ brief }: { brief: RichBrief | null }) {
  const state = useFormState();
  const base = useId();
  const [values, setValues] = useState<Readonly<Record<CriteriaKey, string>>>({
    jobTitles: brief?.jobTitles.join(", ") ?? "",
    industries: brief?.industries.join(", ") ?? "",
    geography: brief?.geography ?? "",
  });
  const [pasting, setPasting] = useState(false);
  return (
    <FormGroup title="Qualification criteria">
      <PasteBar>
        <p className="text-caption text-ink-muted">Type the values, or paste lists from Word. Each bullet or line becomes one value.</p>
        <PasteButton onClick={() => setPasting(true)} />
      </PasteBar>
      {CRITERIA.map((entry) => {
        const id = `${base}-${entry.key}`;
        const error = state.status === "error" ? state.fields[entry.key] : undefined;
        const shown = state.status === "error" ? (state.values[entry.key] ?? values[entry.key]) : values[entry.key];
        return (
          <Field key={entry.key} id={id} label={entry.label} {...(entry.helper === undefined ? {} : { helper: entry.helper })} {...(error === undefined ? {} : { error })}>
            {entry.list === true ? (
              <TagInput
                id={id}
                name={entry.key}
                value={shown}
                onChange={(next) => setValues((current) => ({ ...current, [entry.key]: next }))}
                {...(entry.placeholder === undefined ? {} : { placeholder: entry.placeholder })}
                invalid={error !== undefined}
                describedBy={error !== undefined || entry.helper !== undefined ? `${id}-message` : undefined}
              />
            ) : (
              <Input
                id={id}
                name={entry.key}
                autoComplete="off"
                value={shown}
                onChange={(event) => setValues((current) => ({ ...current, [entry.key]: event.target.value }))}
                aria-invalid={error === undefined ? undefined : true}
                aria-describedby={error !== undefined || entry.helper !== undefined ? `${id}-message` : undefined}
              />
            )}
          </Field>
        );
      })}
      <SectionsPasteDialog
        open={pasting}
        onOpenChange={setPasting}
        kind="list"
        title="Paste qualification criteria"
        description="Lists with a heading such as Decision-makers, Industries or Markets go to the matching box. Each bullet or line becomes one value."
        targets={CRITERIA}
        onApply={(assigned) =>
          setValues((current) => {
            const next = { ...current };
            for (const entry of CRITERIA) {
              const added = assigned[entry.key];
              if (added !== undefined) next[entry.key] = mergeValues(current[entry.key], splitValues(added));
            }
            return next;
          })
        }
      />
    </FormGroup>
  );
}

// ---- Qualifying questions -------------------------------------------------------------------------------------------------------------------

type Row = QualifyingItem & { readonly key: number };

/** A key for each row that stays with it when rows are moved or removed. */
let lastRowKey = 0;
const next = (item: QualifyingItem): Row => ({ ...item, key: lastRowKey++ });

/**
 * The questions the sales team asks a prospect, each with the answer the client hopes to hear, both rich text. Rows are added, moved and removed
 * here; "Paste from Word" reads a whole list of them. The list posts as JSON under `qualifyingItems`. A campaign set up with the old single box
 * starts with its lines as questions, and the old box is cleared when the list is saved.
 */
export function QuestionsFields({ brief }: { brief: RichBrief | null }) {
  const state = useFormState();
  const base = useId();
  const [rows, setRows] = useState<readonly Row[]>(() => {
    const start = brief === null ? [] : qualifyingItemsFor(brief.qualifyingItems, brief.qualifyingQuestions);
    return (start.length > 0 ? start : [{ question: "", answer: "" }]).map(next);
  });
  const [pasting, setPasting] = useState(false);
  const error = state.status === "error" ? state.fields.qualifyingItems : undefined;

  const change = (key: number, patch: Partial<QualifyingItem>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [moved] = copy.splice(index, 1);
      if (moved !== undefined) copy.splice(target, 0, moved);
      return copy;
    });
  const posted = JSON.stringify(rows.map(({ question, answer }) => ({ question, answer })));
  const count = rows.filter((row) => !isHtmlEmpty(row.question) || !isHtmlEmpty(row.answer)).length;

  return (
    <FormGroup title="Critical qualifying questions">
      <PasteBar>
        <p className="text-caption text-ink-muted">
          {count === 0 ? "The 5 or 6 key questions the sales team asks, each with the answer you hope to hear." : count === 1 ? "1 question." : `${count} questions.`}
        </p>
        <PasteButton label="Paste questions from Word" onClick={() => setPasting(true)} />
      </PasteBar>
      <ol className="flex flex-col gap-3 md:col-span-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-col gap-3 rounded-md bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label font-semibold text-ink">Question {index + 1}</span>
              <span className="flex items-center gap-0.5">
                <button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-2 hover:bg-navy-06 disabled:opacity-30">
                  <ArrowUp aria-hidden size={14} weight="bold" />
                </button>
                <button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-2 hover:bg-navy-06 disabled:opacity-30">
                  <ArrowDown aria-hidden size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => setRows((current) => (current.length === 1 ? [next({ question: "", answer: "" })] : current.filter((entry) => entry.key !== row.key)))}
                  className="inline-flex size-7 items-center justify-center rounded-sm text-ink-2 hover:bg-red-soft hover:text-red-text"
                >
                  <Trash aria-hidden size={14} weight="bold" />
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${base}-q-${row.key}`}>Question</Label>
              <RichEditor id={`${base}-q-${row.key}`} label={`Question ${index + 1}`} value={row.question} onChange={(html) => change(row.key, { question: html })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${base}-a-${row.key}`}>Expected answer</Label>
              <RichEditor id={`${base}-a-${row.key}`} label={`Expected answer to question ${index + 1}`} value={row.answer} onChange={(html) => change(row.key, { answer: html })} />
            </div>
          </li>
        ))}
      </ol>
      {error === undefined ? null : (
        <p role="alert" className="text-xs text-destructive md:col-span-2">
          {error}
        </p>
      )}
      <div className="md:col-span-2">
        <Button type="button" variant="secondary" size="sm" disabled={rows.length >= MAX_QUALIFYING_ITEMS} onClick={() => setRows((current) => [...current, next({ question: "", answer: "" })])}>
          <Plus aria-hidden weight="bold" />
          Add question
        </Button>
      </div>
      <input type="hidden" name="qualifyingItems" value={posted} />
      {/* The old single box is cleared when the list is saved, so deleting every question really removes them. */}
      <input type="hidden" name="qualifyingQuestions" value="" />
      <QuestionsPasteDialog
        open={pasting}
        onOpenChange={setPasting}
        existing={count}
        onApply={(items, mode) =>
          setRows((current) => {
            const kept = mode === "replace" ? [] : current.filter((row) => !isHtmlEmpty(row.question) || !isHtmlEmpty(row.answer));
            return [...kept, ...items.map(next)].slice(0, MAX_QUALIFYING_ITEMS);
          })
        }
      />
    </FormGroup>
  );
}
