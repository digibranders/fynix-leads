import type { Metadata } from "next";
import { Clock } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { StatusChip } from "@/components/fynix/status-chip";
import {
  AcceptLeadTimeButton,
  DeclineLeadForm,
} from "@/components/tenant/lead-review-actions";
import { TenantPageHeader } from "@/components/tenant/page-header";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { listClientLeads } from "@/server/domain/leads";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "To respond" };

export default async function ClientReviewQueuePage() {
  const view = await requireClient();
  const db = getDatabase("leads_client").db;
  const awaitingLeads = await listClientLeads(db, view.actor, { stage: "awaiting_client" });

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="To respond"
        subtitle="Review qualified prospects and confirm your preferred meeting time."
      />

      {awaitingLeads.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={Clock} title="No leads awaiting response">
            When partner agencies source qualified leads matching your criteria, they will arrive here for meeting confirmation.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {awaitingLeads.map((leadItem) => {
            const proposedTimes = Array.isArray(leadItem.proposedTimes)
              ? (leadItem.proposedTimes as string[])
              : [];

            return (
              <div
                key={leadItem.id}
                className="rounded-lg bg-surface p-6 shadow-raised flex flex-col gap-4 border border-ink-4/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-canvas border border-ink-4/20">
                        {leadItem.publicRef}
                      </span>
                      <StatusChip kind="lead" status={leadItem.stage as LeadStage} size="sm" />
                    </div>
                    <h3 className="mt-2 text-title font-semibold">
                      {leadItem.prospectName}
                    </h3>
                    <p className="text-sm text-ink-2">
                      {leadItem.prospectTitle} at{" "}
                      <span className="font-medium text-ink">{leadItem.prospectCompany}</span> ({leadItem.prospectDomain})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DeclineLeadForm leadId={leadItem.id} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 rounded bg-canvas p-4 text-xs">
                  <div>
                    <span className="font-semibold text-ink-2 uppercase tracking-wider block">Budget</span>
                    <p className="mt-1 text-ink">{leadItem.bantBudget}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-2 uppercase tracking-wider block">Authority</span>
                    <p className="mt-1 text-ink">{leadItem.bantAuthority}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-2 uppercase tracking-wider block">Need</span>
                    <p className="mt-1 text-ink">{leadItem.bantNeed}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-2 uppercase tracking-wider block">Timeline</span>
                    <p className="mt-1 text-ink">{leadItem.bantTimeline}</p>
                  </div>
                </div>

                {leadItem.prospectNotes && (
                  <p className="text-xs text-ink-2 italic">
                    Note: {leadItem.prospectNotes}
                  </p>
                )}

                <div className="mt-2 pt-4 border-t border-ink-4/10">
                  <h4 className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-2">
                    Select a proposed meeting time:
                  </h4>
                  <div className="flex flex-wrap items-center gap-3">
                    {proposedTimes.map((isoTime, index) => {
                      const dateObj = new Date(isoTime);
                      const display = isNaN(dateObj.getTime())
                        ? isoTime
                        : dateObj.toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          });

                      return (
                        <AcceptLeadTimeButton
                          key={index}
                          leadId={leadItem.id}
                          meetingTimeIso={isoTime}
                          displayTime={display}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
