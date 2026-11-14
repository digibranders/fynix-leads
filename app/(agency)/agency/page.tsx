import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Clock, Table, Target, Warning } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantKpiCard, TenantKpiGrid } from "@/components/tenant/metric-cards";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getAgencyOverviewMetrics } from "@/server/domain/analytics";
import { listAgencyLeads } from "@/server/domain/leads";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Overview" };

export default async function AgencyOverviewPage() {
  const view = await requireAgency();
  const db = getDatabase("leads_agency").db;
  const metrics = await getAgencyOverviewMetrics(db, view.actor);
  const leads = await listAgencyLeads(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Overview"
        subtitle="Track your allocated campaign shares and booked meetings."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/agency/leads/new"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Submit Lead
            </Link>
            <Link
              href="/agency/leads"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              My Leads
            </Link>
          </div>
        }
      />

      <TenantKpiGrid>
        <TenantKpiCard
          title="Monthly Share Target"
          value={metrics.agencyShareTarget}
          subtitle="Allocated monthly target"
          icon={Target}
          tone="default"
        />
        <TenantKpiCard
          title="Delivered Leads"
          value={metrics.deliveredCount}
          subtitle={
            metrics.agencyShareTarget > 0
              ? `${Math.round((metrics.deliveredCount / metrics.agencyShareTarget) * 100)}% of monthly share delivered`
              : "Delivered to clients"
          }
          icon={CheckCircle}
          tone="emerald"
        />
        <TenantKpiCard
          title="Awaiting Response"
          value={metrics.awaitingClientCount}
          subtitle="Prospects pending client review"
          icon={Clock}
          tone={metrics.awaitingClientCount > 0 ? "amber" : "default"}
        />
        <TenantKpiCard
          title="Over-Share Submissions"
          value={metrics.overShareCount}
          subtitle="Submitted beyond allocated share"
          icon={Warning}
          tone={metrics.overShareCount > 0 ? "rose" : "default"}
        />
      </TenantKpiGrid>

      <div className="rounded-lg bg-surface p-6 shadow-raised border border-ink-4/10">
        <div className="flex items-center justify-between pb-4 border-b border-ink-4/10">
          <div>
            <h2 className="text-section font-semibold">My Lead Submissions</h2>
            <p className="mt-1 text-body text-ink-2">Recent qualified prospects submitted across active client campaigns.</p>
          </div>
          {leads.length > 0 && (
            <Link
              href="/agency/leads"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              View All ({leads.length})
            </Link>
          )}
        </div>

        {leads.length === 0 ? (
          <div className="mt-6 rounded-md bg-canvas">
            <EmptyState icon={Table} title="No leads submitted yet">
              New lead submissions and meeting schedules will appear here with live tracking.
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
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-4/10">
                {leads.slice(0, 5).map((l) => (
                  <tr key={l.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-mono font-medium text-ink">{l.publicRef}</td>
                    <td className="px-4 py-3 font-medium text-ink">{l.prospectName}</td>
                    <td className="px-4 py-3 text-ink-2">{l.prospectCompany}</td>
                    <td className="px-4 py-3 font-medium capitalize text-ink-2">{l.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-ink-2">{new Date(l.submittedAt).toLocaleDateString()}</td>
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
