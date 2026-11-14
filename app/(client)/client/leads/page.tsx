import type { Metadata } from "next";
import { FileText } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { StatusChip } from "@/components/fynix/status-chip";
import { DisputeLeadForm } from "@/components/tenant/lead-review-actions";
import { TenantPageHeader } from "@/components/tenant/page-header";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { listClientLeads } from "@/server/domain/leads";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Campaign Leads" };

export default async function ClientLeadsPage() {
  const view = await requireClient();
  const db = getDatabase("leads_client").db;
  const leads = await listClientLeads(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Campaign Leads"
        subtitle="Every prospect submitted for your campaign across all stages."
      />

      {leads.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={FileText} title="No campaign leads yet">
            Prospects qualified by partner agencies will appear here once submitted.
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface shadow-raised border border-ink-4/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-4/10 bg-canvas text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Prospect</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Meeting Time</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-4/10">
              {leads.map((leadItem) => {
                const isDisputed = leadItem.stage === "disputed";

                return (
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
                        : "Not scheduled"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {new Date(leadItem.submittedAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {leadItem.canDispute && view.canWrite && (
                        <DisputeLeadForm leadId={leadItem.id} />
                      )}
                      {isDisputed && (
                        <span className="text-xs font-semibold text-destructive">Disputed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
