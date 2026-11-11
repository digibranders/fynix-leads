"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/lib/domain/types";
import { resetPendingCount, setPendingCount } from "@/lib/review/pending-store";
import { queueSegments, removeByRef } from "@/lib/review/queue";
import { ClarifyDialog } from "./clarify-dialog";
import { LeadPanel } from "./lead-panel";
import { QueueList, type Segment } from "./queue-list";
import { RejectDialog } from "./reject-dialog";
import { useReviewKeys } from "./use-review-keys";

type Props = {
  leads: Lead[];
  /** ISO timestamp the waiting times are measured against. */
  now: string;
  viewerZone: string;
};

type Dialog = "reject" | "clarify" | null;
type View = "list" | "detail";

const UNDO_MS = 6000;
const LG_QUERY = "(min-width: 1024px)";

const EMPTY_COPY: Record<Segment, { title: string; text: string }> = {
  waiting: { title: "Nothing waiting for review", text: "New leads appear here as soon as they are submitted." },
  clarifying: { title: "No open questions", text: "Leads you ask about stay here until the Fynix team replies." },
  decided: { title: "No decisions yet", text: "Approved and rejected leads appear here." },
};

const segmentOf = (lead: Lead): Segment =>
  lead.approval === "needs_clarification" ? "clarifying" : lead.approval === "pending" ? "waiting" : "decided";

export function ReviewQueue({ leads: initialLeads, now, viewerZone }: Props) {
  const nowDate = useMemo(() => new Date(now), [now]);

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [segment, setSegment] = useState<Segment>("waiting");
  // null means "the first lead of the segment", which is also where a fresh segment starts.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [dialog, setDialog] = useState<Dialog>(null);

  const segments = useMemo(() => queueSegments(leads), [leads]);
  const list = segments[segment];
  const selected = list.find((l) => l.ref === selectedRef) ?? list[0] ?? null;
  const selectedIndex = selected ? list.indexOf(selected) : -1;

  // The shell badge and the page subtitle read the same count.
  useEffect(() => setPendingCount(segments.waiting.length), [segments.waiting.length]);
  useEffect(() => resetPendingCount, []);

  // The layout switches by CSS. This only tells the shortcuts and the toast whether the list or a lead fills a phone screen.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(LG_QUERY);
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const leadsRef = useRef(leads);
  useEffect(() => {
    leadsRef.current = leads;
  });
  const focusEmptyRef = useRef(false);

  const restore = useCallback((original: Lead, applied: Lead) => {
    // Idempotent: a second click on Undo, or an Undo after the lead changed again, finds a different lead and does nothing.
    if (leadsRef.current.find((l) => l.ref === original.ref) !== applied) return;
    setLeads((all) => all.map((l) => (l.ref === original.ref ? original : l)));
    setSegment(segmentOf(original));
    setSelectedRef(original.ref);
  }, []);

  function decide(original: Lead, applied: Lead, message: string) {
    const removal = removeByRef(list, original.ref);
    focusEmptyRef.current = removal.items.length === 0;
    setLeads((all) => all.map((l) => (l.ref === original.ref ? applied : l)));
    setSelectedRef(removal.nextRef);
    setDialog(null);
    toast(message, {
      duration: UNDO_MS,
      // On a phone the bottom of the screen is the action tray, so the toast goes to the top.
      position: wide ? "bottom-right" : "top-center",
      action: { label: "Undo", onClick: () => restore(original, applied) },
    });
  }

  // A decision made now sorts newest even if the sample clock is ahead of the real one.
  const decidedAt = () => new Date(Math.max(Date.now(), nowDate.getTime())).toISOString();

  function approve() {
    if (!selected || segment === "decided") return;
    const applied: Lead = { ...selected, approval: "approved", decision: { outcome: "approved", decidedAt: decidedAt() } };
    decide(selected, applied, `Approved ${selected.ref}`);
  }

  // Phase 0 keeps no data: the question is collected by its dialog and then dropped. The reason and note stay for the Decided summary.
  function confirmReject(reasonCode: string, note: string) {
    if (!selected || segment === "decided") return;
    const applied: Lead = {
      ...selected,
      approval: "rejected",
      decision: { outcome: "rejected", reasonCode, note: note || undefined, decidedAt: decidedAt() },
    };
    decide(selected, applied, `Rejected ${selected.ref}`);
  }

  function confirmClarify() {
    if (!selected || segment !== "waiting") return;
    decide(selected, { ...selected, approval: "needs_clarification" }, `Question sent for ${selected.ref}`);
  }

  const openReject = () => segment !== "decided" && setDialog("reject");
  const openClarify = () => segment === "waiting" && setDialog("clarify");

  function move(step: 1 | -1) {
    const target = list[selectedIndex + step];
    if (target) setSelectedRef(target.ref);
  }

  function select(ref: string) {
    setSelectedRef(ref);
    setView("detail");
  }

  function changeSegment(next: Segment) {
    setSegment(next);
    setSelectedRef(null);
    setView("list");
  }

  function resetSampleData() {
    toast.dismiss();
    setLeads(initialLeads);
    setSegment("waiting");
    setSelectedRef(null);
    setView("list");
  }

  // Keyboard shortcuts call the latest closures through one stable object, so the listener is attached once.
  const latest = useRef({ approve, reject: openReject, clarify: openClarify, move });
  useEffect(() => {
    latest.current = { approve, reject: openReject, clarify: openClarify, move };
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
  // On a phone the list hides the open lead, so shortcuts only make sense once a lead is on screen.
  useReviewKeys(handlers, selected !== null && dialog === null && (wide || view === "detail"));

  // A new lead opens at its top. The panel resets its own scroll on desktop, the page does on a phone.
  useEffect(() => {
    if (!wide) window.scrollTo({ top: 0 });
  }, [selected?.ref, view, wide]);

  // After the last decision in a segment the buttons disappear, so hand focus to the empty state heading.
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (list.length === 0 && focusEmptyRef.current) {
      focusEmptyRef.current = false;
      emptyHeadingRef.current?.focus();
    }
  }, [list.length]);

  const empty = EMPTY_COPY[segment];

  return (
    <>
      <div
        data-view={view}
        className="group/review grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[372px_minmax(0,1fr)]"
      >
        <QueueList
          segment={segment}
          segments={segments}
          selectedRef={selected?.ref ?? null}
          now={nowDate}
          viewerZone={viewerZone}
          onSegmentChange={changeSegment}
          onSelect={select}
          onReset={resetSampleData}
          className="group-data-[view=detail]/review:max-lg:hidden"
        />

        {selected ? (
          <LeadPanel
            lead={selected}
            segment={segment}
            now={nowDate}
            viewerZone={viewerZone}
            onBack={() => setView("list")}
            onApprove={approve}
            onReject={openReject}
            onClarify={openClarify}
            className="group-data-[view=list]/review:max-lg:hidden"
          />
        ) : (
          <section
            aria-label="Lead details"
            className="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-lg bg-surface px-6 py-12 text-center shadow-raised group-data-[view=list]/review:max-lg:hidden"
          >
            <div className="flex flex-col gap-1">
              <h2 ref={emptyHeadingRef} tabIndex={-1} className="text-[18px] leading-6 font-semibold outline-none">
                {empty.title}
              </h2>
              <p className="text-body text-ink-2 text-pretty">{empty.text}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={resetSampleData}>
              Reset sample data
            </Button>
          </section>
        )}
      </div>

      {selected && (
        <>
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
      )}
    </>
  );
}
