import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Clock, Flag, Table, Target } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantKpiCard, TenantKpiGrid } from "@/components/tenant/metric-cards";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getClientOverviewMetrics } from "@/server/domain/analytics";
import { listClientLeads } from "@/server/domain/leads";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Overview" };

export default async function ClientOverviewPage() {
  const view = await requireClient();
  const db = getDatabase("leads_client").db;
  const metrics = await getClientOverviewMetrics(db, view.actor);
  const leads = await listClientLeads(db, view.actor);
  const awaitingLeads = leads.filter((l) => l.stage === "awaiting_client");

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Overview"
        subtitle="Track your campaign targets and qualified meetings."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/client/review"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Review Leads ({metrics.awaitingClientCount})
            </Link>
            <Link
              href="/client/leads"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              All Leads
            </Link>
          </div>
        }
      />

      <TenantKpiGrid>
        <TenantKpiCard
          title="Target vs Delivered"
          value={`${metrics.deliveredCount} / ${metrics.targetCount}`}
          subtitle={
            metrics.targetCount > 0
              ? `${Math.round((metrics.deliveredCount / metrics.targetCount) * 100)}% of monthly target delivered`
              : "No active monthly target"
          }
          icon={Target}
          tone="emerald"
        />
        <TenantKpiCard
          title="Awaiting Response"
          value={metrics.awaitingClientCount}
          subtitle={
            metrics.awaitingClientCount === 1
              ? "1 prospect awaiting your decision"
              : `${metrics.awaitingClientCount} prospects awaiting your decision`
          }
          icon={Clock}
          tone={metrics.awaitingClientCount > 0 ? "amber" : "default"}
        />
        <TenantKpiCard
          title="Scheduled Meetings"
          value={metrics.scheduledCount}
          subtitle="Confirmed upcoming calls"
          icon={CheckCircle}
          tone="default"
        />
        <TenantKpiCard
          title="Active Disputes"
          value={metrics.disputedCount}
          subtitle="Leads under dispute review"
          icon={Flag}
          tone={metrics.disputedCount > 0 ? "rose" : "default"}
        />
      </TenantKpiGrid>

      <div className="rounded-lg bg-surface p-6 shadow-raised border border-ink-4/10">
        <div className="flex items-center justify-between pb-4 border-b border-ink-4/10">
          <div>
            <h2 className="text-section font-semibold">Leads Awaiting Review</h2>
            <p className="mt-1 text-body text-ink-2">Prospects submitted by partner agencies requiring your approval or meeting time selection.</p>
          </div>
          {awaitingLeads.length > 0 && (
            <Link
              href="/client/review"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Open Review Queue
            </Link>
          )}
        </div>

        {awaitingLeads.length === 0 ? (
          <div className="mt-6 rounded-md bg-canvas">
            <EmptyState icon={Table} title="No leads awaiting response">
              When partner agencies source qualified leads matching your ICP and BANT criteria, they will arrive here for approval.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border border-ink-4/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-4/10 bg-canvas text-xs uppercase tracking-wider text-ink-2">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-4/10">
                {awaitingLeads.slice(0, 5).map((l) => (
                  <tr key={l.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-mono font-medium text-ink">{l.publicRef}</td>
                    <td className="px-4 py-3 font-medium text-ink">{l.prospectName}</td>
                    <td className="px-4 py-3 text-ink-2">{l.prospectCompany}</td>
                    <td className="px-4 py-3 text-ink-2">{new Date(l.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href="/client/review"
                        className={buttonVariants({ variant: "secondary", size: "xs" })}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
