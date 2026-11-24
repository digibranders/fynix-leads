import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { SubmitLeadForm } from "@/components/leads/submit-lead-form";
import { getDatabase } from "@/server/db/client";
import { listCampaignReadiness } from "@/server/domain/campaigns-tenant";
import { getLeadSubmissionOptions } from "@/server/domain/leads";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Submit a lead" };

async function SubmitLead() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const [options, readiness] = await Promise.all([getLeadSubmissionOptions(db, view.actor), listCampaignReadiness(db, view.actor)]);
  const notLive = readiness.flatMap((row) => (row.notLiveReason === null ? [] : [{ campaignId: row.campaignId, name: row.name, reason: row.notLiveReason }]));
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Submit a lead" description="Prospect details, the qualification answers, and one to three proposed meeting times." />
      <SubmitLeadForm campaigns={options.campaigns} aliases={options.aliases} hosts={options.hosts} notLive={notLive} leadsHref="/supplier/leads" />
    </div>
  );
}

export default function SupplierSubmitLeadPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubmitLead />
    </Suspense>
  );
}
