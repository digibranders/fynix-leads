import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CaretLeft, Check, ChatCircle, ListMagnifyingGlass, UsersThree, Warning, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ContactTile, MeetingTile, QualificationTiles } from "@/components/leads/lead-tiles";
import { StatusBadge } from "@/components/status/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { Lead } from "@/lib/domain/types";
import { REJECTION_REASONS } from "@/lib/domain/rejection-reasons";
import { formatWaiting, isOverdue } from "@/lib/time/age";
import { formatInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";
import type { Segment } from "./queue-list";

type Props = {
  lead: Lead;
  segment: Segment;
  now: Date;
  viewerZone: string;
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClarify: () => void;
  className?: string;
};

export function LeadPanel({ lead, segment, now, viewerZone, onBack, onApprove, onReject, onClarify, className }: Props) {
  const { prospect } = lead;
  const submitted = new Date(lead.submittedAt);
  const headingId = `lead-${lead.ref}-name`;
  const pending = lead.approval === "pending";
  const overdue = isOverdue(submitted, now);

  // The tray gets its shadow only while content still scrolls beneath it.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [raised, setRaised] = useState(false);
  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (el) setRaised(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }, []);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [lead.ref, measure]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("@container flex min-w-0 flex-col rounded-lg bg-surface shadow-raised lg:min-h-0 lg:overflow-hidden", className)}
    >
      <div
        ref={scrollerRef}
        onScroll={measure}
        className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[scrollbar-color:var(--navy-10)_transparent] lg:[scrollbar-width:thin]"
      >
        <div>
          <div className="px-4 pt-4 lg:hidden">
            <Button variant="secondary" size="sm" onClick={onBack} className="max-lg:h-11">
              <CaretLeft aria-hidden />
              Back to queue
            </Button>
          </div>

          <header className="grid grid-cols-1 gap-x-7 px-4 pt-5 pb-[22px] lg:px-7 @[34rem]:grid-cols-[minmax(0,1fr)_auto]">
            <div className="col-span-full mb-3 flex flex-wrap items-center gap-2.5">
              <StatusBadge kind="approval" status={lead.approval} />
              <span className="inline-flex h-[26px] items-center rounded-full bg-navy-05 px-2.5 font-mono text-[12.5px] font-medium text-ink-2">
                {lead.ref}
              </span>
              <Link
                href={`/client/leads/${lead.ref}`}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "ml-auto outline-none focus-visible:ring-2 focus-visible:ring-ring")}
              >
                Open lead record
                <ArrowUpRight aria-hidden />
              </Link>
            </div>

            <div className="min-w-0">
              <h2 id={headingId} className="text-name font-semibold tracking-title text-balance break-words">
                {prospect.name}
              </h2>
              <p className="mt-0.5 text-lead text-ink-2">
                <span className="font-medium text-ink">{prospect.title}</span> at {prospect.company}
              </p>
              <p className="mt-2.5 flex items-start gap-[7px] text-[13px] leading-[18px] text-ink-muted">
                <UsersThree aria-hidden size={16} className="mt-px shrink-0" />
                <span>
                  Submitted by the Fynix team on {formatInZone(submitted, viewerZone)}
                  {lead.replacesRef && (
                    <>
                      . Replacement for <span className="font-mono">{lead.replacesRef}</span>
                    </>
                  )}
                </span>
              </p>
            </div>

            {pending && (
              <div className="relative mt-4 self-center @[34rem]:mt-0 @[34rem]:pl-8 @[34rem]:text-right @[34rem]:before:absolute @[34rem]:before:inset-y-1 @[34rem]:before:left-0 @[34rem]:before:w-px @[34rem]:before:bg-line">
                <p className="text-[12.5px] leading-4 font-medium text-ink-muted">Waiting</p>
                <p
                  className={cn(
                    "text-[38px] leading-[44px] font-semibold tracking-[-0.02em] tabular-nums",
                    overdue ? "text-red-text" : "text-ink",
                  )}
                >
                  {formatWaiting(submitted, now)}
                </p>
                {overdue && (
                  <p className="inline-flex items-center gap-[5px] text-[13px] font-semibold text-red-text">
                    <Warning aria-hidden size={15} weight="fill" />
                    Overdue
                  </p>
                )}
              </div>
            )}
          </header>

          <div className="mx-4 h-px bg-line lg:mx-7" />

          <div className="px-4 pt-[22px] pb-6 lg:px-7">
            <div className="grid grid-cols-1 gap-3 @[40rem]:grid-cols-2">
              <MeetingTile lead={lead} viewerZone={viewerZone} />
              <ContactTile lead={lead} viewerZone={viewerZone} now={now} />
            </div>
            <h3 className="mt-[26px] mb-3.5 flex items-center gap-[9px] text-[15px] font-semibold">
              <ListMagnifyingGlass aria-hidden size={19} className="text-ink-2" />
              Qualification
            </h3>
            <QualificationTiles lead={lead} className="@[34rem]:grid-cols-2" />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "sticky bottom-0 z-10 rounded-b-lg bg-surface transition-shadow max-lg:shadow-tray",
          raised && "lg:shadow-tray",
        )}
      >
        {segment === "decided" ? <DecisionSummary lead={lead} viewerZone={viewerZone} /> : <Actions segment={segment} onApprove={onApprove} onReject={onReject} onClarify={onClarify} />}
      </div>
    </section>
  );
}

function Actions({
  segment,
  onApprove,
  onReject,
  onClarify,
}: {
  segment: Segment;
  onApprove: () => void;
  onReject: () => void;
  onClarify: () => void;
}) {
  return (
    <div className="flex min-h-[76px] flex-wrap items-center gap-x-2.5 gap-y-2 rounded-b-lg bg-navy-04 px-4 py-3 lg:px-6">
      <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap">
        <Button onClick={onApprove} data-review-action="approve" aria-keyshortcuts="A">
          <Check aria-hidden weight="bold" />
          Approve
          <Kbd className="hidden lg:inline-grid">A</Kbd>
        </Button>
        <Button variant="destructive" onClick={onReject} data-review-action="reject" aria-keyshortcuts="R">
          <X aria-hidden weight="bold" />
          Reject
          <Kbd className="hidden lg:inline-grid">R</Kbd>
        </Button>
        {segment === "waiting" && (
          <Button
            variant="secondary"
            onClick={onClarify}
            data-review-action="clarify"
            aria-keyshortcuts="C"
            className="col-span-2 sm:col-span-1"
          >
            <ChatCircle aria-hidden />
            Ask for clarification
            <Kbd className="hidden lg:inline-grid">C</Kbd>
          </Button>
        )}
      </div>
<KeyHint />
    </div>
  );
}

/** Single-key shortcuts only work while focus is inside the workspace (WCAG 2.1.4), so the hint says so. */
function KeyHint() {
  return (
    <p className="ml-auto hidden max-w-52 text-right text-[12.5px] leading-4 text-pretty text-ink-2 @[44rem]:block">
      <Kbd>J</Kbd> and <Kbd>K</Kbd> move between leads. Shortcuts work while focus is in this panel.
    </p>
  );
}

/** Decided leads are read-only: the tray states the outcome instead of offering buttons. */
function DecisionSummary({ lead, viewerZone }: { lead: Lead; viewerZone: string }) {
  const { decision } = lead;
  const reason = decision?.reasonCode
    ? (REJECTION_REASONS.find((r) => r.code === decision.reasonCode)?.label ?? decision.reasonCode)
    : null;
  return (
    <div className="flex min-h-[76px] flex-wrap items-center gap-x-4 gap-y-2 rounded-b-lg bg-navy-04 px-4 py-3.5 lg:px-6">
      <StatusBadge kind="approval" status={lead.approval} />
      <div className="min-w-0 flex-1 text-[13px] leading-[18px]">
        {reason && (
          <p className="font-medium">
            <span className="text-ink-muted">Reason: </span>
            {reason}
          </p>
        )}
        {decision?.note && <p className="text-ink-2 text-pretty">{decision.note}</p>}
        {decision && (
          <p className="text-ink-muted">
            Decided <time dateTime={decision.decidedAt}>{formatInZone(new Date(decision.decidedAt), viewerZone)}</time>
          </p>
        )}
      </div>
<KeyHint />
    </div>
  );
}
