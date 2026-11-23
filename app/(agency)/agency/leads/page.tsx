import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Table } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { StatusChip } from "@/components/fynix/status-chip";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { buttonVariants } from "@/components/ui/button";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { listAgencyLeads } from "@/server/domain/leads";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Agency Leads" };

export default async function AgencyLeadsPage() {
  const view = await requireAgency();
  const db = getDatabase("leads_agency").db;
  const leads = await listAgencyLeads(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <TenantPageHeader
          title="Submitted Leads"
          subtitle="Manage qualified prospects and tracked meetings for your assigned campaigns."
        />
        <Link
          href="/agency/leads/new"
          className={buttonVariants({ variant: "default", size: "default", className: "gap-2" })}
        >
          <Plus aria-hidden weight="bold" />
          <span>Submit Lead</span>
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={Table} title="No leads submitted yet">
            Begin by submitting qualified prospects with validated BANT criteria and proposed meeting times.
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface shadow-raised ">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Prospect</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Meeting Time</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((leadItem) => (
                <tr key={leadItem.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 font-mono font-medium text-xs">{leadItem.publicRef}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{leadItem.prospectName}</p>
                    <p className="text-xs text-ink-2">{leadItem.prospectTitle}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{leadItem.prospectCompany}</p>
                    <p className="text-xs text-ink-2">{leadItem.prospectDomain}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip kind="lead" status={leadItem.stage as LeadStage} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {leadItem.scheduledMeetingTime
                      ? new Date(leadItem.scheduledMeetingTime).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Awaiting confirmation"}
                  </td>
                  <td className="px-4 py-3">
                    {leadItem.overShare && (
                      <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                        Over-share
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {new Date(leadItem.submittedAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
