"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { LeadDetails } from "@/components/leads/lead-details";
import { StatusBadge } from "@/components/status/status-badge";
import { WaitingAge } from "@/components/time/waiting-age";
import { useIsDesktop } from "@/components/shell/use-is-desktop";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { Lead } from "@/lib/domain/types";
import { insertAt, removeByRef, reviewQueue } from "@/lib/review/queue";
import { formatInZone } from "@/lib/time/zones";
import { ClarifyDialog } from "./clarify-dialog";
import { RejectDialog } from "./reject-dialog";
import { useReviewKeys } from "./use-review-keys";

type Props = {
  leads: Lead[];
  /** ISO timestamp the waiting times are measured against. */
  now: string;
  viewerZone: string;
};

type Dialog = "reject" | "clarify" | null;

const UNDO_MS = 6000;
export function ReviewQueue({ leads, now, viewerZone }: Props) {
  const nowDate = useMemo(() => new Date(now), [now]);
  const initialQueue = useMemo(() => reviewQueue(leads), [leads]);

  const [queue, setQueue] = useState<Lead[]>(initialQueue);
  const [selectedRef, setSelectedRef] = useState<string | null>(initialQueue[0]?.ref ?? null);
  const [mobileView, setMobileView] = useState<"list" | "lead">("list");
  const [dialog, setDialog] = useState<Dialog>(null);
  const isDesktop = useIsDesktop();

  const selected = queue.find((l) => l.ref === selectedRef) ?? queue[0] ?? null;
  const selectedIndex = selected ? queue.indexOf(selected) : -1;

  const restore = useCallback((lead: Lead, index: number) => {
    // Idempotent: a second click on Undo finds the lead already back and does nothing.
    setQueue((q) => (q.some((l) => l.ref === lead.ref) ? q : reviewQueue(insertAt(q, lead, index))));
    setSelectedRef(lead.ref);
  }, []);

  function leaveQueue(lead: Lead, message: string) {
    const removal = removeByRef(queue, lead.ref);
    setQueue(removal.items);
    setSelectedRef(removal.nextRef);
    setDialog(null);
    toast(message, {
      duration: UNDO_MS,
      // On a phone the bottom of the screen is the action bar, so the toast goes to the top.
      position: isDesktop ? "bottom-right" : "top-center",
      action: { label: "Undo", onClick: () => restore(lead, removal.index) },
    });
  }

  const approve = () => selected && leaveQueue(selected, `Approved ${selected.ref}`);
  // Phase 0 keeps no data: the reason, note and question are collected by the dialogs and then dropped.
  const confirmReject = () => selected && leaveQueue(selected, `Rejected ${selected.ref}`);
  const confirmClarify = () => selected && leaveQueue(selected, `Question sent for ${selected.ref}`);

  function move(step: 1 | -1) {
    const target = queue[selectedIndex + step];
    if (target) setSelectedRef(target.ref);
  }

  function select(ref: string) {
    setSelectedRef(ref);
    setMobileView("lead");
  }

  function resetSampleData() {
    toast.dismiss();
    setQueue(initialQueue);
    setSelectedRef(initialQueue[0]?.ref ?? null);
    setMobileView("list");
  }

  // Keyboard shortcuts call the latest closures through one stable object, so the listener is attached once.
  const latest = useRef({ approve, reject: () => setDialog("reject"), clarify: () => setDialog("clarify"), move });
  useEffect(() => {
    latest.current = { approve, reject: () => setDialog("reject"), clarify: () => setDialog("clarify"), move };
  });
  const handlers = useMemo(
    () => ({
      approve: () => latest.current.approve(),
      reject: () => latest.current.reject(),
      clarify: () => latest.current.clarify(),
      next: () => latest.current.move(1),
      previous: () => latest.current.move(-1),
    }),
    [],
  );
  // On a phone the list hides the open lead, so decisions only make sense once a lead is on screen.
  const leadVisible = isDesktop || mobileView === "lead";
  useReviewKeys(handlers, selected !== null && dialog === null && leadVisible);

  // A new lead opens at its top, in the pane on desktop and on the page on a phone.
  useEffect(() => {
    if (!isDesktop) window.scrollTo({ top: 0 });
  }, [selected?.ref, mobileView, isDesktop]);

  // Keep the selected row in view when J and K walk through a long list.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected?.ref]);

  // After the last decision the buttons disappear, so hand focus to the empty state heading.
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (queue.length === 0) emptyHeadingRef.current?.focus();
  }, [queue.length]);

  if (!selected) {
    return (
      <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-lg border bg-card px-6 py-12 text-center">
        <div className="flex flex-col gap-1">
          <h2 ref={emptyHeadingRef} tabIndex={-1} className="text-base font-medium outline-none">
            Nothing waiting for review
          </h2>
          <p className="text-sm text-muted-foreground">New leads appear here as soon as they are submitted.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetSampleData}>
          Reset sample data
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        data-view={mobileView}
        className="group/review grid overflow-clip rounded-lg border bg-card lg:h-[calc(100dvh-7rem)] lg:min-h-[32rem] grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]"
      >
        <nav
          aria-label="Leads waiting for review"
          className="flex min-h-0 flex-col border-border group-data-[view=lead]/review:max-lg:hidden lg:border-r"
        >
          <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
            <p aria-live="polite" className="text-sm font-medium">
              {queue.length} waiting for review
            </p>
            <p className="text-xs text-muted-foreground">Oldest first</p>
          </div>
          <ul ref={listRef} className="min-h-0 flex-1 divide-y overflow-y-auto">
            {queue.map((lead) => (
              <li key={lead.ref}>
                <QueueRow lead={lead} now={nowDate} selected={lead.ref === selected.ref} onSelect={select} />
              </li>
            ))}
          </ul>
        </nav>

        <LeadPane
          lead={selected}
          now={nowDate}
          viewerZone={viewerZone}
          onBack={() => setMobileView("list")}
          onApprove={approve}
          onReject={() => setDialog("reject")}
          onClarify={() => setDialog("clarify")}
          className="group-data-[view=list]/review:max-lg:hidden"
        />
      </div>

      <RejectDialog
        open={dialog === "reject"}
        onOpenChange={(open) => setDialog(open ? "reject" : null)}
        leadRef={selected.ref}
        prospectName={selected.prospect.name}
        onConfirm={confirmReject}
      />
      <ClarifyDialog
        open={dialog === "clarify"}
        onOpenChange={(open) => setDialog(open ? "clarify" : null)}
        leadRef={selected.ref}
        prospectName={selected.prospect.name}
        onConfirm={confirmClarify}
      />
    </>
  );
}

function QueueRow({
  lead,
  now,
  selected,
  onSelect,
}: {
  lead: Lead;
  now: Date;
  selected: boolean;
  onSelect: (ref: string) => void;
}) {
  const { prospect } = lead;
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(lead.ref)}
      className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:aria-[current=true]:bg-accent"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{prospect.name}</span>
        <span className="shrink-0">
          <span className="sr-only">Waiting </span>
          <WaitingAge since={new Date(lead.submittedAt)} now={now} />
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {prospect.company}, {prospect.title}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{lead.ref}</span>
    </button>
  );
}

function LeadPane({
  lead,
  now,
  viewerZone,
  onBack,
  onApprove,
  onReject,
  onClarify,
  className,
}: {
  lead: Lead;
  now: Date;
  viewerZone: string;
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClarify: () => void;
  className?: string;
}) {
  const { prospect } = lead;
  const submitted = new Date(lead.submittedAt);
  const headingId = `lead-${lead.ref}-name`;

  return (
    <section aria-labelledby={headingId} className={`flex min-h-0 min-w-0 flex-col ${className ?? ""}`}>
      <div className="border-b px-2 py-2 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} className="max-lg:h-11 max-lg:px-2.5">
          <CaretLeft aria-hidden />
          Back to queue
        </Button>
      </div>

      <div key={lead.ref} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 lg:px-6">
        <header className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h2 id={headingId} className="text-xl font-semibold">
              {prospect.name}
            </h2>
            <StatusBadge kind="approval" status={lead.approval} />
          </div>
          <p className="text-sm text-muted-foreground">
            {prospect.title} at {prospect.company}
          </p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-mono text-xs text-muted-foreground">{lead.ref}</p>
            <Link
              href={`/client/leads/${lead.ref}`}
              className="rounded-sm text-sm text-primary underline underline-offset-4 outline-none hover:text-navy-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open full record
            </Link>
          </div>
        </header>

        <LeadDetails lead={lead} viewerZone={viewerZone} now={now} />

        <footer className="flex flex-col gap-1 border-t pt-5 text-xs text-muted-foreground">
          <p>
            Submitted by the Fynix team on {formatInZone(submitted, viewerZone)}. Waiting{" "}
            <WaitingAge since={submitted} now={now} />.
          </p>
          {lead.replacesRef && (
            <p>
              Replacement for <span className="font-mono">{lead.replacesRef}</span>.
            </p>
          )}
        </footer>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-card px-4 py-3 lg:static lg:px-6">
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <Button onClick={onApprove} data-review-action="approve" aria-keyshortcuts="A">
            Approve
            <Kbd className="hidden lg:inline-grid">A</Kbd>
          </Button>
          <Button
            variant="destructive"
            onClick={onReject}
            data-review-action="reject" aria-keyshortcuts="R"
          >
            Reject
            <Kbd className="hidden lg:inline-grid">R</Kbd>
          </Button>
          <Button
            variant="secondary"
            onClick={onClarify}
            data-review-action="clarify" aria-keyshortcuts="C"
            className="col-span-2"
          >
            Ask for clarification
            <Kbd className="hidden lg:inline-grid">C</Kbd>
          </Button>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">
          <Kbd>J</Kbd> and <Kbd>K</Kbd> move between leads
        </p>
      </div>
    </section>
  );
}
