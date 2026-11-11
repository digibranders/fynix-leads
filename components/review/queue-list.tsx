import { useEffect, useRef } from "react";
import { ArrowsDownUp, CheckCircle, Clock, Question, Warning, XCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Lead } from "@/lib/domain/types";
import { clarificationState } from "@/lib/leads/thread";
import type { QueueSegments } from "@/lib/review/queue";
import { formatWaiting, isOverdue } from "@/lib/time/age";
import { formatDayInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

export type Segment = keyof QueueSegments;

export const SEGMENT_COPY: Record<Segment, { tab: string; title: string; order: string; empty: string }> = {
  waiting: { tab: "Waiting", title: "Waiting for review", order: "Oldest first", empty: "No leads are waiting for review." },
  clarifying: { tab: "Clarifying", title: "Waiting for answers", order: "Oldest first", empty: "No questions are open." },
  decided: { tab: "Decided", title: "Decided", order: "Newest first", empty: "No leads have been decided yet." },
};

const SEGMENTS = Object.keys(SEGMENT_COPY) as Segment[];

type Props = {
  segment: Segment;
  segments: QueueSegments;
  selectedRef: string | null;
  now: Date;
  viewerZone: string;
  onSegmentChange: (segment: Segment) => void;
  onSelect: (ref: string) => void;
  onReset: () => void;
  className?: string;
};

export function QueueList({
  segment,
  segments,
  selectedRef,
  now,
  viewerZone,
  onSegmentChange,
  onSelect,
  onReset,
  className,
}: Props) {
  const list = segments[segment];
  const copy = SEGMENT_COPY[segment];
  const overdue = segment === "waiting" ? list.filter((l) => isOverdue(new Date(l.submittedAt), now)).length : 0;

  // Keep the selected row in view when J and K walk through a long list.
  const rowsRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    rowsRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedRef, segment]);

  return (
    <section
      aria-label="Leads"
      className={cn("flex min-h-0 flex-col rounded-lg bg-tonal px-2 max-lg:pb-2 lg:max-h-full", className)}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 pr-1 pl-3">
        <h2 className="text-value font-semibold tracking-[-0.005em]">{copy.title}</h2>
        {/* Announces the new count after every decision. */}
        <p aria-live="polite" className="sr-only">
          {list.length} {segment === "waiting" ? "waiting for review" : segment === "clarifying" ? "with questions open" : "decided"}
        </p>
        <span className="ml-auto inline-flex h-8 items-center gap-[7px] rounded-full bg-navy-07 px-3.5 text-[13px] font-semibold text-ink">
          <ArrowsDownUp aria-hidden size={16} />
          {copy.order}
        </span>
      </div>

      <Tabs value={segment} onValueChange={(value) => onSegmentChange(value as Segment)} className="mx-1 mb-2 shrink-0">
        <TabsList className="w-full" aria-label="Show">
          {SEGMENTS.map((key) => (
            <TabsTrigger key={key} value={key} className="px-2">
              {SEGMENT_COPY[key].tab} <b>{segments[key].length}</b>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-3 py-4 text-[13px] text-ink-muted">
          <p>{copy.empty}</p>
          <Button variant="secondary" size="sm" onClick={onReset} className="lg:hidden">
            Reset sample data
          </Button>
        </div>
      ) : (
        <ul ref={rowsRef} className="min-h-0 flex-1 overflow-y-auto pt-0.5 pb-1.5 [scrollbar-color:var(--navy-10)_transparent] [scrollbar-width:thin]">
          {list.map((lead, i) => {
            const selected = lead.ref === selectedRef;
            // The inset divider sits above a row and is hidden next to the lifted card.
            const divider = i > 0 && !selected && list[i - 1].ref !== selectedRef;
            return (
              <li key={lead.ref} className={cn("relative", selected && "z-10")}>
                {divider && <span aria-hidden className="absolute inset-x-[18px] top-0 h-px bg-line" />}
                <QueueRow lead={lead} segment={segment} now={now} viewerZone={viewerZone} selected={selected} onSelect={onSelect} />
              </li>
            );
          })}
        </ul>
      )}

      {overdue > 0 && (
        <p className="flex h-12 shrink-0 items-center gap-2 px-3 text-[13px] text-ink-muted">
          <Warning aria-hidden size={16} weight="fill" className="shrink-0 text-red-text" />
          <span>
            <b className="font-semibold text-red-text">{overdue} overdue</b>, waiting more than 24 hours
          </span>
        </p>
      )}
    </section>
  );
}

function QueueRow({
  lead,
  segment,
  now,
  viewerZone,
  selected,
  onSelect,
}: {
  lead: Lead;
  segment: Segment;
  now: Date;
  viewerZone: string;
  selected: boolean;
  onSelect: (ref: string) => void;
}) {
  const { prospect } = lead;
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(lead.ref)}
      className={cn(
        "relative grid h-[96px] w-full lg:h-[104px] grid-cols-[minmax(0,1fr)_auto] content-center gap-x-3 rounded-md px-[18px] text-left outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected
          ? "bg-surface shadow-selected before:absolute before:top-[18px] before:bottom-[18px] before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-peach"
          : "hover:bg-navy-04",
      )}
    >
      <span className="min-w-0">
        <span className={cn("block truncate text-[14.5px] leading-5", selected ? "font-semibold" : "font-medium")}>
          {prospect.name}
        </span>
        <span className="block truncate text-[13px] leading-[19px] font-medium text-ink-2">{prospect.company}</span>
        <span className="block truncate text-[13px] leading-[19px] text-ink-muted">{prospect.title}</span>
      </span>
      <RowStatus lead={lead} segment={segment} now={now} viewerZone={viewerZone} />
    </button>
  );
}

function RowStatus({ lead, segment, now, viewerZone }: { lead: Lead; segment: Segment; now: Date; viewerZone: string }) {
  const ref = <span className="block font-mono text-[11.5px] leading-[19px] font-medium text-ink-muted">{lead.ref}</span>;
  const line = "flex items-center justify-end gap-[5px] text-[14px] leading-5 font-semibold tabular-nums";
  const caption = "block text-[12.5px] leading-[19px]";

  if (segment === "waiting") {
    const since = new Date(lead.submittedAt);
    const overdue = isOverdue(since, now);
    return (
      <span className="shrink-0 text-right">
        <span className={cn(line, overdue ? "text-red-text" : "text-ink-2")}>
          {overdue ? <Warning aria-hidden size={15} weight="fill" /> : <Clock aria-hidden size={15} />}
          <span className="sr-only">Waiting </span>
          {formatWaiting(since, now)}
        </span>
        <span className={cn(caption, overdue ? "font-semibold text-red-text" : "text-ink-muted")}>
          {overdue ? "Overdue" : "Waiting"}
        </span>
        {ref}
      </span>
    );
  }

  if (segment === "clarifying") {
    // The client asked and Fynix answered: the ball is back with the client, so say so in plain words.
    const answered = clarificationState(lead.thread) === "reply_received";
    return (
      <span className="shrink-0 text-right">
        <span className={cn(line, "text-blue-text")}>
          <Question aria-hidden size={15} weight="fill" />
          {answered ? "Reply received" : "Question sent"}
        </span>
        <span className={cn(caption, "text-ink-muted")}>{answered ? "Review the answer" : "Awaiting reply"}</span>
        {ref}
      </span>
    );
  }

  const approved = lead.approval === "approved";
  const Glyph = approved ? CheckCircle : XCircle;
  return (
    <span className="shrink-0 text-right">
      <span className={cn(line, approved ? "text-green-text" : "text-red-text")}>
        <Glyph aria-hidden size={15} weight="fill" />
        {approved ? "Approved" : "Rejected"}
      </span>
      <span className={cn(caption, "text-ink-muted")}>
        {lead.decision ? formatDayInZone(new Date(lead.decision.decidedAt), viewerZone) : ""}
      </span>
      {ref}
    </span>
  );
}
