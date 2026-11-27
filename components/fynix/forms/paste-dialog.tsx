"use client";

import { ClipboardText, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import type { QualifyingItem } from "@/lib/qualifying-items";
import { parseQuestions, pasteToBlocks, splitSections, toValueList } from "@/lib/rich-text-paste";
import { isHtmlEmpty } from "@/lib/rich-text-view";

/**
 * "Paste from Word": the person pastes what they copied, sees what was found and where it goes, fixes it, and only then is anything put in the
 * form. Two shapes of paste are read: a list of questions with their expected answers, and a document split into named sections.
 */

type Source = { readonly html: string; readonly text: string };
const EMPTY: Source = { html: "", text: "" };

/** The paste area. Pasting keeps the clipboard's formatted version for the reader; typing and plain paste give text only. */
function PasteArea({ id, source, onSource }: { id: string; source: Source; onSource: (source: Source) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Paste here</Label>
      <Textarea
        id={id}
        rows={5}
        value={source.text}
        placeholder="Copy from Word or Google Docs, then paste here (Ctrl V or Cmd V)."
        onPaste={(event) => {
          const html = event.clipboardData.getData("text/html");
          if (html === "") return;
          event.preventDefault();
          onSource({ html, text: event.clipboardData.getData("text/plain") });
        }}
        onChange={(event) => onSource({ html: "", text: event.target.value })}
        className="max-h-48 resize-y"
      />
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>;
}

type QuestionsProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** How many questions the list has now, so the dialog can offer to add to them or replace them. */
  readonly existing: number;
  readonly onApply: (items: readonly QualifyingItem[], mode: "add" | "replace") => void;
};

/** Questions with expected answers, read from a numbered list, "Q1" and "Answer:" lines, nested bullets or a two column table. */
export function QuestionsPasteDialog(props: QuestionsProps) {
  // Mounted only while open, so each opening starts with an empty paste area and nothing flashes while it closes.
  return props.open ? <QuestionsPasteBody {...props} /> : null;
}

function QuestionsPasteBody({ open, onOpenChange, existing, onApply }: QuestionsProps) {
  const [source, setSource] = useState<Source>(EMPTY);
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [mode, setMode] = useState<"add" | "replace">("add");
  const found = useMemo(() => (source.html === "" && source.text.trim() === "" ? [] : parseQuestions(pasteToBlocks(source))), [source]);
  const kept = found.filter((_, index) => !removed.has(index));
  const close = () => {
    onOpenChange(false);
    setSource(EMPTY);
    setRemoved(new Set());
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88dvh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paste questions from Word</DialogTitle>
          <DialogDescription>A numbered list, Q1 and Answer lines, bullets under a question, or a table with a question column and an answer column. You check them before they are added.</DialogDescription>
        </DialogHeader>
        <PasteArea
          id="paste-questions"
          source={source}
          onSource={(next) => {
            setSource(next);
            setRemoved(new Set());
          }}
        />
        {found.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-label font-semibold text-ink">
              {found.length === 1 ? "1 question found" : `${found.length} questions found`}, {found.filter((item) => !isHtmlEmpty(item.answer)).length} with an expected answer
            </p>
            <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {found.map((item, index) => (
                <li key={`${index}-${item.question}`} className={cn("grid grid-cols-[1.5rem_1fr_auto] gap-2 rounded-md bg-surface px-3 py-2.5", removed.has(index) && "opacity-40")}>
                  <span className="pt-0.5 text-caption font-semibold text-ink-muted tabular-nums">{index + 1}</span>
                  <div className="min-w-0 text-table">
                    <RichText value={item.question} className="font-medium text-ink" />
                    {isHtmlEmpty(item.answer) ? <p className="mt-1 text-caption text-ink-muted">No expected answer found</p> : <RichText value={item.answer} className="mt-1 text-ink-2" />}
                  </div>
                  <button
                    type="button"
                    aria-label={removed.has(index) ? `Keep question ${index + 1}` : `Leave out question ${index + 1}`}
                    onClick={() => setRemoved((current) => new Set(removed.has(index) ? [...current].filter((entry) => entry !== index) : [...current, index]))}
                    className="inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-navy-06"
                  >
                    <X aria-hidden size={14} weight="bold" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : source.text.trim() !== "" ? (
          <p className="text-table text-ink-2">Nothing that looks like a question was found. Check what was pasted.</p>
        ) : null}
        {existing > 0 && kept.length > 0 ? (
          <div role="radiogroup" aria-label="What to do with the questions already there" className="flex flex-wrap gap-4 text-table">
            {(
              [
                ["add", `Add to the ${existing} already there`],
                ["replace", "Replace them"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="paste-mode" checked={mode === value} onChange={() => setMode(value)} className="size-4 accent-navy" />
                {label}
              </label>
            ))}
          </div>
        ) : null}
        <Foot>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={kept.length === 0}
            onClick={() => {
              onApply(kept, existing > 0 ? mode : "add");
              close();
            }}
          >
            {kept.length === 1 ? "Add 1 question" : `Add ${kept.length} questions`}
          </Button>
        </Foot>
      </DialogContent>
    </Dialog>
  );
}

export type SectionTarget<K extends string> = { readonly key: K; readonly label: string; readonly test: RegExp };

type SectionsProps<K extends string> = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly targets: readonly SectionTarget<K>[];
  /** "rich" fields keep the formatting; "list" fields take short values (one per bullet, line or comma). */
  readonly kind: "rich" | "list";
  /** What goes into each field: HTML for "rich", comma separated values for "list". Fields nothing was assigned to are left out. */
  readonly onApply: (assigned: Partial<Record<K, string>>) => void;
};

/** A document split into the fields that are named in it, with a choice of field for each part before anything is used. */
export function SectionsPasteDialog<K extends string>(props: SectionsProps<K>) {
  return props.open ? <SectionsPasteBody {...props} /> : null;
}

function SectionsPasteBody<K extends string>({ open, onOpenChange, title, description, targets, kind, onApply }: SectionsProps<K>) {
  const [source, setSource] = useState<Source>(EMPTY);
  const [choice, setChoice] = useState<Readonly<Record<number, string>>>({});
  const sections = useMemo(() => (source.html === "" && source.text.trim() === "" ? [] : splitSections(pasteToBlocks(source), targets)), [source, targets]);
  // A part whose heading names a field goes there. When nothing matched at all (no headings), the whole paste goes to the first field.
  const anyMatched = sections.some((section) => section.key !== null);
  const target = (index: number): string => choice[index] ?? sections[index]?.key ?? (!anyMatched && index === 0 ? (targets[0]?.key ?? "skip") : "skip");
  const close = () => {
    onOpenChange(false);
    setSource(EMPTY);
    setChoice({});
  };
  const apply = () => {
    const assigned: Partial<Record<K, string>> = {};
    sections.forEach((section, index) => {
      const key = target(index) as K | "skip";
      if (key === "skip") return;
      // A list field takes plain values, joined with commas; a rich field takes the section's HTML, one section after another.
      const piece = kind === "list" ? toValueList(section.html).join(", ") : section.html;
      const before = assigned[key];
      assigned[key] = before === undefined ? piece : kind === "list" ? `${before}, ${piece}` : `${before}${piece}`;
    });
    onApply(assigned);
    close();
  };
  const placed = sections.filter((_, index) => target(index) !== "skip").length;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88dvh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PasteArea
          id={`paste-${kind}`}
          source={source}
          onSource={(next) => {
            setSource(next);
            setChoice({});
          }}
        />
        {sections.length > 0 ? (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {sections.map((section, index) => (
              <li key={`${index}-${section.title}`} className="grid gap-2 rounded-md bg-surface px-3 py-2.5 md:grid-cols-[13rem_1fr]">
                <div className="flex flex-col gap-1">
                  <span className="truncate text-caption text-ink-muted">{section.title === "" ? "Before any heading" : section.title}</span>
                  <Choice
                    aria-label={`Where this part goes: ${section.title === "" ? "text before any heading" : section.title}`}
                    value={target(index)}
                    onValueChange={(next) => setChoice((current) => ({ ...current, [index]: next }))}
                    options={[...targets.map((entry) => ({ value: entry.key as string, label: entry.label })), { value: "skip", label: "Leave out" }]}
                  />
                </div>
                <div className={cn("min-w-0 text-table text-ink-2", target(index) === "skip" && "opacity-40")}>
                  {kind === "rich" ? (
                    <RichText value={section.html} className="max-h-40 overflow-y-auto" />
                  ) : (
                    <p className="flex flex-wrap gap-1.5">
                      {toValueList(section.html).map((value) => (
                        <span key={value} className="rounded-sm bg-navy-06 px-2 py-0.5 text-caption text-ink">
                          {value}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : source.text.trim() !== "" ? (
          <p className="text-table text-ink-2">Nothing was found in what was pasted.</p>
        ) : null}
        {placed > 0 ? <p className="text-caption text-ink-muted">{kind === "rich" ? "A field that already has text gets the new text added below it." : "New values are added to the ones already there."}</p> : null}
        <Foot>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={placed === 0} onClick={apply}>
            {placed === 1 ? "Use 1 part" : `Use ${placed} parts`}
          </Button>
        </Foot>
      </DialogContent>
    </Dialog>
  );
}

/** The small button that opens a paste dialog, with the same look wherever it is used. */
export function PasteButton({ label = "Paste from Word", onClick }: { label?: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <ClipboardText aria-hidden weight="bold" />
      {label}
    </Button>
  );
}
