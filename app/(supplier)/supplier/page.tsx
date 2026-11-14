import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Clock, Target, UsersThree, Warning } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantKpiCard, TenantKpiGrid } from "@/components/tenant/metric-cards";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getSupplierOverviewMetrics } from "@/server/domain/analytics";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Overview" };

export default async function SupplierOverviewPage() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const metrics = await getSupplierOverviewMetrics(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Overview"
        subtitle="Track your partner agencies, delivered meetings, and shares."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/supplier/leads/new"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Submit Lead
            </Link>
            <Link
              href="/supplier/agencies"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Partner Agencies
            </Link>
          </div>
        }
      />

      <TenantKpiGrid>
        <TenantKpiCard
          title="Target vs Delivered"
          value={`${metrics.deliveredCount} / ${metrics.supplierTarget}`}
          subtitle={
            metrics.supplierTarget > 0
              ? `${Math.round((metrics.deliveredCount / metrics.supplierTarget) * 100)}% of monthly target delivered`
              : "No active monthly target"
          }
          icon={Target}
          tone="emerald"
        />
        <TenantKpiCard
          title="Awaiting Client"
          value={metrics.awaitingClientCount}
          subtitle="Prospects pending client response"
          icon={Clock}
          tone={metrics.awaitingClientCount > 0 ? "amber" : "default"}
        />
        <TenantKpiCard
          title="Over-Share Submissions"
          value={metrics.overShareCount}
          subtitle="Submitted above allocated share"
          icon={Warning}
          tone={metrics.overShareCount > 0 ? "rose" : "default"}
        />
        <TenantKpiCard
          title="Active Disputes"
          value={metrics.disputedCount}
          subtitle="Leads currently under dispute"
          icon={CheckCircle}
          tone="default"
        />
      </TenantKpiGrid>

      <div className="rounded-lg bg-surface p-6 shadow-raised border border-ink-4/10">
        <div className="flex items-center justify-between pb-4 border-b border-ink-4/10">
          <div>
            <h2 className="text-section font-semibold">Partner Agency Breakdown</h2>
            <p className="mt-1 text-body text-ink-2">Performance and share allocation across partner agencies and direct supply.</p>
          </div>
          <Link
            href="/supplier/agencies"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Manage Shares
          </Link>
        </div>

        {metrics.agencyBreakdown.length === 0 ? (
          <div className="mt-6 rounded-md bg-canvas">
            <EmptyState icon={UsersThree} title="No partner agencies allocated">
              When partner agencies are invited and assigned campaign shares, their delivery status will appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border border-ink-4/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-4/10 bg-canvas text-xs uppercase tracking-wider text-ink-2">
                <tr>
                  <th className="px-4 py-3">Agency</th>
                  <th className="px-4 py-3 text-right">Share Target</th>
                  <th className="px-4 py-3 text-right">Delivered</th>
                  <th className="px-4 py-3 text-right">Awaiting Client</th>
                  <th className="px-4 py-3 text-right">Over-Share</th>
                  <th className="px-4 py-3 text-right">Disputed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-4/10">
                {metrics.agencyBreakdown.map((item) => (
                  <tr key={item.agencyOrgId} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-medium text-ink">{item.agencyName}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{item.shareTarget}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{item.deliveredCount}</td>
                    <td className="px-4 py-3 text-right text-ink-2">{item.awaitingClientCount}</td>
                    <td className="px-4 py-3 text-right text-ink-2">{item.overShareCount}</td>
                    <td className="px-4 py-3 text-right text-ink-2">{item.disputedCount}</td>
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
