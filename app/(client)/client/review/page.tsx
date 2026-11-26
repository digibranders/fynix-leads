import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { ClosedTag } from "@/components/kit/closed-tag";
import { Facts, Quote } from "@/components/kit/facts";
import { TabNav } from "@/components/kit/tab-nav";
import { DecisionQueue } from "@/components/leads/decision-queue";
import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { When } from "@/components/kit/when";
import { ReviewPanel } from "@/components/leads/review-panel";
import { buttonVariants } from "@/components/ui/button";
import { isClosed } from "@/lib/campaign-status";
import { formatWaiting, isOverdue } from "@/lib/time/age";
import { cn } from "@/lib/utils";
import { getDatabase } from "@/server/db/client";
import { listClientQueues } from "@/server/domain/client-queue";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Availability" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Review({ searchParams }: { searchParams: PageProps<"/client/review">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const db = getDatabase("leads_client").db;
  const now = new Date();

  // Two queues: leads waiting for a time (oldest first, the longest wait is answered next) and leads waiting for accept or reject.
  const { availability: queue, decisions } = await listClientQueues(db, view.actor);
  const showDecisions = one(params.show) === "decision" || (one(params.show) !== "time" && queue.length === 0 && decisions.length > 0);
  const selected = queue.find((item) => item.id === one(params.lead)) ?? queue[0];
  const total = queue.length + decisions.length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Availability"
        description={
          total === 0
            ? "Nothing is waiting for your answer."
            : `${total} ${total === 1 ? "lead needs" : "leads need"} your answer: a time to pick or a decision to make.`
        }
      />

      <TabNav
        label="Queue"
        items={[
          { label: "Pick a time", href: "/client/review?show=time", count: queue.length, active: !showDecisions },
          { label: "Decision needed", href: "/client/review?show=decision", count: decisions.length, active: showDecisions },
        ]}
      />

      {showDecisions ? (
        <DecisionQueue items={decisions} now={now} />
      ) : selected === undefined ? (
        <Panel>
          <EmptyState
            icon={CheckCircle}
            title="You are all caught up"
            action={
              <Link href="/client/leads" className={buttonVariants({ variant: "secondary" })}>
                See all leads
              </Link>
            }
          >
            New qualified leads arrive here for you to pick a meeting time. Picking a time books the meeting only.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[var(--queue-w)_minmax(0,1fr)]">
          <Panel aria-label="Leads to respond to" className="p-2">
            <ul className="flex flex-col gap-0.5">
              {queue.map((item) => {
                const here = item.id === selected.id;
                const since = new Date(item.submittedAt);
                return (
                  <li key={item.id}>
                    <Link
                      href={`/client/review?show=time&lead=${item.id}`}
                      aria-current={here ? "true" : undefined}
                      scroll={false}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                        here ? "bg-selected before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-peach" : "hover:bg-navy-04",
                      )}
                    >
                      <Person name={item.prospectName} sub={item.prospectCompany} className="flex-1" />
                      <span className={cn("shrink-0 text-label", isOverdue(since, now) ? "font-semibold text-amber-text" : "text-ink-muted")}>
                        {formatWaiting(since, now)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel aria-label={`${selected.prospectName}, ${selected.prospectCompany}`} className="flex min-h-[560px] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
              <div className="min-w-0">
                <h2 className="text-name font-semibold tracking-title text-balance">{selected.prospectName}</h2>
                <p className="mt-0.5 text-lead text-ink-muted">
                  {selected.prospectTitle}, {selected.prospectCompany}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/client/leads/${selected.publicRef}`} className="rounded-xs bg-navy-05 px-1.5 py-0.5 font-mono text-caption font-medium text-ink-2 hover:underline">
                  {selected.publicRef}
                </Link>
                <StatusChip kind="lead" status="awaiting_client" />
              </div>
            </div>
            <p className="px-6 pt-1 text-label text-ink-muted">
              Submitted <When at={selected.submittedAt} style="day" />
              {selected.prospectDomain ? ` · ${selected.prospectDomain}` : ""}
            </p>

            <div className="flex flex-col gap-5 px-6 py-5">
              <Facts
                items={[
                  ["Team member", selected.hostName ?? "Not named"],
                  ["Sent as", selected.alias === null ? "Not shown" : `${selected.alias.displayName}, ${selected.alias.jobTitle}`],
                  ["Campaign", <span key="c" className="flex flex-wrap items-center gap-1.5">{selected.campaignName}{isClosed(selected.campaignStatus) ? <ClosedTag /> : null}</span>],
                  ["Their time zone", selected.hostTimeZone ?? "Not set"],
                  ["Budget", selected.bant.budget],
                  ["Authority", selected.bant.authority],
                  ["Need", selected.bant.need],
                  ["Timeline", selected.bant.timeline],
                ]}
              />
              {selected.prospectNotes ? <Quote>{selected.prospectNotes}</Quote> : null}
            </div>

            <ReviewPanel
              key={selected.id}
              leadId={selected.id}
              prospectName={selected.prospectName}
              times={selected.proposedTimes}
              hostZone={selected.hostTimeZone}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

export default function ClientReviewQueuePage({ searchParams }: PageProps<"/client/review">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Review searchParams={searchParams} />
    </Suspense>
  );
}
