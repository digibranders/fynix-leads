import type { Metadata } from "next";
import { Table } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { StatusChip } from "@/components/fynix/status-chip";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { listFynixLeads } from "@/server/domain/leads";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Leads" };

export default async function FynixGlobalLeadsPage() {
  const view = await requireFynix();
  const db = getDatabase("leads_fynix").db;
  const leads = await listFynixLeads(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <FynixPageHeader
        title="Global Leads"
        subtitle="Monitor qualified leads across all campaigns, track pipeline throughput, and resolve disputes."
      />

      {leads.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={Table} title="No leads submitted yet">
            As partner agencies and suppliers submit qualified prospects, they will appear here across all campaigns.
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface shadow-raised ">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Campaign</th>
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
                    <p className="font-semibold text-ink">{leadItem.campaignName}</p>
                    <p className="text-xs text-ink-2">{leadItem.clientBrandName}</p>
                  </td>
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
                      : "Pending"}
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
