"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle, UsersThree, X } from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { RejectDialog } from "@/components/review/reject-dialog";
import { useReviewKeys } from "@/components/review/use-review-keys";
import { HeaderTools } from "@/components/shell/page-header";
import { MobileNav } from "@/components/shell/mobile-nav";
import { StatusBadge } from "@/components/status/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isDelivered } from "@/lib/domain/delivered";
import { REJECTION_REASONS, type RejectionReasonCode } from "@/lib/domain/rejection-reasons";
import type { ActivityEvent, Decision, Lead, ThreadMessage } from "@/lib/domain/types";
import type { ApprovalStatus } from "@/lib/domain/status";
import { relayText } from "@/lib/relay/relay-text";
import { getSnapshot, resetPendingCount, setPendingCount } from "@/lib/review/pending-store";
import { formatInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";
import { ActivityTimeline } from "./activity-timeline";
import { LeadDetails } from "./lead-details";
import { Panel } from "./panel";
import { RelayThread } from "./relay-thread";

type Props = {
  lead: Lead;
  /** ISO timestamp used as the time of everything done on this screen. */
  now: string;
  viewerZone: string;
};

type Section = "details" | "activity" | "messages";

const UNDO_MS = 6000;
const MINUTE_MS = 60_000;
const LG_QUERY = "(min-width: 1024px)";
// Never reached: the record has no next or previous lead, but the shortcut hook wants a full set of handlers.
const NO_OP = () => {};

const reasonLabel = (code: string | undefined): string | undefined => REJECTION_REASONS.find((r) => r.code === code)?.label;

/** The reason list words "other" as an instruction ("explain in the note"), which reads wrongly in a summary. */
const reasonSummary = (code: string | undefined): string | undefined => (code === "other" ? "Other" : reasonLabel(code));

/** "Company outside the target profile" becomes "company outside the target profile" to sit after a colon. */
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function LeadRecord({ lead, now, viewerZone }: Props) {
  const nowDate = useMemo(() => new Date(now), [now]);
  const submitted = useMemo(() => new Date(lead.submittedAt), [lead.submittedAt]);

  const [approval, setApproval] = useState<ApprovalStatus>(lead.approval);
  const [decision, setDecision] = useState<Decision | undefined>(lead.decision);
  const [events, setEvents] = useState<ActivityEvent[]>(lead.activity);
  const [messages, setMessages] = useState<ThreadMessage[]>(lead.thread);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [section, setSection] = useState<Section>("details");

  const localCount = useRef(0);
  const summaryRef = useRef<HTMLElement>(null);

  // The rail badge counts leads waiting for a decision. Leaving the record puts the sample count back, as the review queue does.
  useEffect(() => resetPendingCount, []);

  const current: Lead = { ...lead, approval, decision, activity: events, thread: messages };
  const canDecide = approval === "pending" || approval === "needs_clarification";
  const delivered = isDelivered(current);

  function decide(next: Decision, eventText: string, toastText: string) {
    const previous = { approval, decision };
    // Only a lead still waiting for review is in the count. A lead the client already asked about is not.
    const wasWaiting = approval === "pending";
    const event: ActivityEvent = {
      id: `EV-${lead.ref}-local-${++localCount.current}`,
      at: now,
      actor: "Client",
      kind: "human",
      text: eventText,
    };
    setApproval(next.outcome);
    setDecision(next);
    setEvents((list) => [...list, event]);
    setRejectOpen(false);
    if (wasWaiting) setPendingCount(Math.max(0, getSnapshot() - 1));
    // The buttons disappear, so focus moves to the summary that replaces them.
    requestAnimationFrame(() => summaryRef.current?.focus());

    let undone = false;
    toast.dismiss();
    toast(toastText, {
      duration: UNDO_MS,
      // On a phone the bottom of the screen belongs to the on-screen keyboard, so the toast goes to the top.
      position: window.matchMedia(LG_QUERY).matches ? "bottom-right" : "top-center",
      action: {
        label: "Undo",
        // Idempotent: a second click restores nothing and moves the count only once.
        onClick: () => {
          if (undone) return;
          undone = true;
          setApproval(previous.approval);
          setDecision(previous.decision);
          setEvents((list) => list.filter((e) => e.id !== event.id));
          if (wasWaiting) setPendingCount(getSnapshot() + 1);
        },
      },
    });
  }

  const approve = () => decide({ outcome: "approved", decidedAt: now }, "Approved", `Approved ${lead.ref}`);

  function confirmReject(reason: RejectionReasonCode, note: string) {
    const label = reasonLabel(reason) ?? "";
    const text = reason === "other" ? "Rejected: other reason" : `Rejected: ${lowerFirst(label)}`;
    // A rejection note is relayed text, so it is scrubbed like a message.
    const scrubbed = relayText(note).text;
    decide(
      { outcome: "rejected", reasonCode: reason, note: scrubbed || undefined, decidedAt: now },
      text,
      `Rejected ${lead.ref}`,
    );
  }

  function send(text: string) {
    setMessages((list) => [
      ...list,
      {
        id: `TH-${lead.ref}-local-${list.length + 1}`,
        at: new Date(nowDate.getTime() + (list.length + 1) * MINUTE_MS).toISOString(),
        author: "Client",
        side: "client",
        body: relayText(text).text,
      },
    ]);
  }

  // The keys call the latest closures through one stable object, so the listener is attached once.
  const latest = useRef({ approve, reject: () => setRejectOpen(true) });
  useEffect(() => {
    latest.current = { approve, reject: () => setRejectOpen(true) };
  });
  const handlers = useMemo(
    () => ({
      approve: () => latest.current.approve(),
      reject: () => latest.current.reject(),
      clarify: NO_OP,
      next: NO_OP,
      previous: NO_OP,
    }),
    [],
  );
  useReviewKeys(handlers, canDecide && !rejectOpen);

  const { prospect } = lead;
  // From lg every section is visible. Below it only the section picked in the segmented control is.
  const shown = (name: Section): string => (section === name ? "" : "max-lg:hidden");

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <MobileNav className="md:hidden" />
        <Link
          href="/client/review"
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "order-3 bg-navy-05 pr-3.5 pl-2.5 font-medium text-ink-2 hover:bg-navy-08 max-md:h-11 md:order-none",
          )}
        >
          <ArrowLeft aria-hidden />
          Back to review queue
        </Link>
        <HeaderTools className="max-md:ml-auto" />
      </div>

      <header className="mt-3.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-name leading-10 font-semibold tracking-title text-balance break-words text-ink">{prospect.name}</h1>
          <p className="mt-0.5 text-lead text-ink-2">
            <span className="font-medium text-ink">{prospect.title}</span> at {prospect.company}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <StatusBadge kind="approval" status={approval} size="lg" />
            <span className="inline-flex h-[26px] items-center rounded-full bg-navy-05 px-2.5 font-mono text-[12.5px] font-medium text-ink-2">
              {lead.ref}
            </span>
            <span className="flex items-start gap-[7px] text-[13px] leading-[18px] text-ink-muted">
              <UsersThree aria-hidden size={16} className="mt-px shrink-0" />
              <span>
                Submitted by the Fynix team on {formatInZone(submitted, viewerZone)}
                {lead.replacesRef && (
                  <>
                    . Replacement for <span className="font-mono">{lead.replacesRef}</span>
                  </>
                )}
              </span>
            </span>
          </div>
        </div>

        {canDecide && (
          <div className="grid w-full grid-cols-2 gap-2.5 pb-0.5 sm:flex sm:w-auto">
            <Button onClick={approve} aria-keyshortcuts="A" data-review-action="approve">
              <Check aria-hidden weight="bold" />
              Approve
              <Kbd className="hidden lg:inline-grid">A</Kbd>
            </Button>
            <Button variant="destructive" onClick={() => setRejectOpen(true)} aria-keyshortcuts="R" data-review-action="reject">
              <X aria-hidden weight="bold" />
              Reject
              <Kbd className="hidden lg:inline-grid">R</Kbd>
            </Button>
          </div>
        )}

        {decision && (
          <section
            ref={summaryRef}
            tabIndex={-1}
            aria-labelledby="decision-heading"
            className="w-full max-w-md rounded-md bg-navy-04 px-4 py-3 text-[13px] leading-[18px] outline-none sm:w-auto sm:min-w-72"
          >
            <h2 id="decision-heading" className="font-semibold">
              {decision.outcome === "approved" ? "You approved this lead" : "You rejected this lead"}
            </h2>
            {decision.reasonCode && (
              <p className="mt-1 font-medium">
                <span className="font-normal text-ink-muted">Reason: </span>
                {reasonSummary(decision.reasonCode)}
              </p>
            )}
            {decision.note && <p className="mt-0.5 break-words text-ink-2 text-pretty">{decision.note}</p>}
            <p className="mt-0.5 text-ink-muted">
              Decided <time dateTime={decision.decidedAt}>{formatInZone(new Date(decision.decidedAt), viewerZone)}</time>
            </p>
          </section>
        )}
      </header>

      {delivered && (
        <p className="mt-4 flex items-center gap-2 rounded-sm bg-green-soft px-4 py-2.5 text-[13.5px] leading-5 text-green-text">
          <CheckCircle aria-hidden size={18} weight="fill" className="shrink-0" />
          <span>
            <span className="font-semibold">Delivered.</span> Approved and the meeting completed.
          </span>
        </p>
      )}

      <Tabs value={section} onValueChange={(value) => setSection(value as Section)} className="mt-5 gap-4">
        <TabsList className="w-full group-data-horizontal/tabs:h-12 lg:hidden">
          <TabsTrigger value="details" className="h-10">
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="h-10">
            Activity <b>{events.length}</b>
          </TabsTrigger>
          <TabsTrigger value="messages" className="h-10">
            Messages <b>{messages.length}</b>
          </TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <LeadDetails lead={current} viewerZone={viewerZone} now={nowDate} className={shown("details")} />

          <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
            <Panel
              id="activity-heading"
              title="Activity"
              meta={`${plural(events.length, "event", "events")}, newest first`}
              headClassName="min-h-[52px]"
              className={shown("activity")}
            >
              <ActivityTimeline events={events} now={nowDate} viewerZone={viewerZone} />
            </Panel>
            <Panel
              id="messages-heading"
              title="Messages"
              meta="Between the client and the Fynix team"
              // An empty thread keeps its natural height instead of stretching to the detail pane.
              className={cn(messages.length > 0 && "lg:flex-1", shown("messages"))}
            >
              <RelayThread messages={messages} now={nowDate} viewerZone={viewerZone} onSend={send} />
            </Panel>
          </div>
        </div>
      </Tabs>

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        leadRef={lead.ref}
        prospectName={prospect.name}
        onConfirm={confirmReject}
      />
    </div>
  );
}
