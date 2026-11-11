"use client";

import { useMemo, useRef, useState } from "react";
import { CaretLeft, CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { RejectDialog } from "@/components/review/reject-dialog";
import { useIsDesktop } from "@/components/shell/use-is-desktop";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isDelivered } from "@/lib/domain/delivered";
import { REJECTION_REASONS, type RejectionReasonCode } from "@/lib/domain/rejection-reasons";
import type { ActivityEvent, Decision, Lead, ThreadMessage } from "@/lib/domain/types";
import type { ApprovalStatus } from "@/lib/domain/status";
import { scrubContactDetails } from "@/lib/relay/scrub";
import { formatInZone } from "@/lib/time/zones";
import { ActivityTimeline } from "./activity-timeline";
import { LeadDetails } from "./lead-details";
import { RelayThread } from "./relay-thread";

type Props = {
  lead: Lead;
  /** ISO timestamp used as the time of everything done on this screen. */
  now: string;
  viewerZone: string;
};

// The line variant marks the active tab with a 2px bar on the list border. Inactive tabs use the muted text token for contrast.
const TAB_CLASS = "rounded-none text-muted-foreground group-data-horizontal/tabs:after:-bottom-px";

const UNDO_MS = 6000;
const MINUTE_MS = 60_000;

const reasonLabel = (code: string | undefined): string | undefined => REJECTION_REASONS.find((r) => r.code === code)?.label;

/** The reason list words "other" as an instruction ("explain in the note"), which reads wrongly in a summary. */
const reasonSummary = (code: string | undefined): string | undefined => (code === "other" ? "Other" : reasonLabel(code));

/** "Company outside the target profile" becomes "company outside the target profile" to sit after a colon. */
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export function LeadRecord({ lead, now, viewerZone }: Props) {
  const nowDate = useMemo(() => new Date(now), [now]);
  const isDesktop = useIsDesktop();

  const [approval, setApproval] = useState<ApprovalStatus>(lead.approval);
  const [decision, setDecision] = useState<Decision | undefined>(lead.decision);
  const [events, setEvents] = useState<ActivityEvent[]>(lead.activity);
  const [messages, setMessages] = useState<ThreadMessage[]>(lead.thread);
  const [rejectOpen, setRejectOpen] = useState(false);

  const localCount = useRef(0);
  const summaryRef = useRef<HTMLElement>(null);

  const current: Lead = { ...lead, approval, decision, activity: events, thread: messages };
  const canDecide = approval === "pending" || approval === "needs_clarification";

  function decide(next: Decision, eventText: string, toastText: string) {
    const previous = { approval, decision };
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
    // The buttons disappear, so focus moves to the summary that replaces them.
    requestAnimationFrame(() => summaryRef.current?.focus());
    toast(toastText, {
      duration: UNDO_MS,
      // On a phone the bottom of the screen belongs to the on-screen keyboard and tab bar, so the toast goes to the top.
      position: isDesktop ? "bottom-right" : "top-center",
      action: {
        label: "Undo",
        // Idempotent: restoring the same values twice changes nothing.
        onClick: () => {
          setApproval(previous.approval);
          setDecision(previous.decision);
          setEvents((list) => list.filter((e) => e.id !== event.id));
        },
      },
    });
  }

  const approve = () => decide({ outcome: "approved", decidedAt: now }, "Approved", `Approved ${lead.ref}`);

  function confirmReject(reason: RejectionReasonCode, note: string) {
    const label = reasonLabel(reason) ?? "";
    const text = reason === "other" ? "Rejected: other reason" : `Rejected: ${lowerFirst(label)}`;
    // A rejection note is relayed text, so it is scrubbed like a message.
    const scrubbed = scrubContactDetails(note).text;
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
        body: text,
      },
    ]);
  }

  const delivered = isDelivered(current);

  const header = (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h2 className="text-xl font-semibold">{lead.prospect.name}</h2>
          <StatusBadge kind="approval" status={approval} size="md" />
        </div>
        <p className="text-sm text-muted-foreground">
          {lead.prospect.title} at {lead.prospect.company}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{lead.ref}</p>
        {delivered && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle aria-hidden size={16} className="shrink-0 text-green-text" />
            <span>
              <span className="font-medium text-foreground">Delivered.</span> Approved and meeting completed.
            </span>
          </p>
        )}
      </div>

      {canDecide && (
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <Button onClick={approve}>
            Approve
          </Button>
          <Button
            variant="destructive"
            onClick={() => setRejectOpen(true)}
            data-review-action="reject"
          >
            Reject
          </Button>
        </div>
      )}

      {decision && (
        <section
          ref={summaryRef}
          tabIndex={-1}
          aria-labelledby="decision-heading"
          className="flex flex-col gap-3 rounded-lg border bg-muted px-4 py-3 outline-none"
        >
          <h3 id="decision-heading" className="text-sm font-medium">
            Your decision
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Outcome</dt>
            <dd>{decision.outcome === "approved" ? "Approved" : "Rejected"}</dd>
            {decision.reasonCode && (
              <>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{reasonSummary(decision.reasonCode)}</dd>
              </>
            )}
            {decision.note && (
              <>
                <dt className="text-muted-foreground">Note</dt>
                <dd className="break-words">{decision.note}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Decided</dt>
            <dd>
              <time dateTime={decision.decidedAt}>{formatInZone(new Date(decision.decidedAt), viewerZone)}</time>
            </dd>
          </dl>
        </section>
      )}
    </header>
  );

  const details = <LeadDetails lead={current} viewerZone={viewerZone} now={nowDate} />;
  const timeline = <ActivityTimeline events={events} viewerZone={viewerZone} />;
  const thread = <RelayThread messages={messages} viewerZone={viewerZone} onSend={send} />;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/client/review"
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-lg:min-h-11"
      >
        <CaretLeft aria-hidden size={14} />
        Back to review queue
      </Link>

      {isDesktop ? (
        <div className="grid grid-cols-[22rem_minmax(0,1fr)] items-start gap-x-10">
          <div className="flex flex-col gap-6">
            {header}
            {details}
          </div>
          <div className="flex flex-col gap-8">
            <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
              <h2 id="activity-heading" className="text-base font-semibold">
                Activity
              </h2>
              {timeline}
            </section>
            <section aria-labelledby="messages-heading" className="flex flex-col gap-3 border-t pt-6">
              <h2 id="messages-heading" className="text-base font-semibold">
                Messages
              </h2>
              {thread}
            </section>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {header}
          <Tabs defaultValue="details">
            <TabsList variant="line" className="w-full gap-0 border-b p-0 group-data-horizontal/tabs:h-11">
              <TabsTrigger value="details" className={TAB_CLASS}>Details</TabsTrigger>
              <TabsTrigger value="activity" className={TAB_CLASS}>Activity</TabsTrigger>
              <TabsTrigger value="messages" className={TAB_CLASS}>Messages</TabsTrigger>
            </TabsList>
            {/* The tab list already draws the rule, so the first block drops its own top rule and padding. */}
            <TabsContent value="details" className="pt-5 [&_section:first-child]:border-t-0 [&_section:first-child]:pt-0">
              {details}
            </TabsContent>
            <TabsContent value="activity" className="pt-4">
              {timeline}
            </TabsContent>
            <TabsContent value="messages" className="pt-4">
              {thread}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        leadRef={lead.ref}
        prospectName={lead.prospect.name}
        onConfirm={confirmReject}
      />
    </div>
  );
}
