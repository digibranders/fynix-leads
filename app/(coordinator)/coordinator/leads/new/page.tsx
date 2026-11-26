import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { SubmitLeadForm } from "@/components/leads/submit-lead-form";
import { getDatabase } from "@/server/db/client";
import { listCampaignReadiness } from "@/server/domain/campaigns-tenant";
import { getLeadSubmissionOptions } from "@/server/domain/leads";
import { orNotFound, requireCoordinator } from "@/server/coordinator/session";
import { getDomain } from "@/server/domain";
import { loadCampaignTeams, loadDraftPrefill } from "@/server/domain/lead-form-data";

export const metadata: Metadata = { title: "Submit a lead" };

async function SubmitLead({ searchParams }: { searchParams: PageProps<"/coordinator/leads/new">["searchParams"] }) {
  const params = await searchParams;
  const draftRef = typeof params.draft === "string" ? params.draft : undefined;
  const view = await requireCoordinator();
  const db = getDatabase("leads_agency").db;
  const [options, readiness] = await Promise.all([getLeadSubmissionOptions(db, view.actor), listCampaignReadiness(db, view.actor)]);
  const [teams, draft] = await Promise.all([loadCampaignTeams(db, getDomain(), view.actor, options.campaigns.map((campaign) => campaign.id)), draftRef === undefined ? null : orNotFound(loadDraftPrefill(db, view.actor, draftRef))]);
  const notLive = readiness.flatMap((row) => (row.notLiveReason === null ? [] : [{ campaignId: row.campaignId, name: row.name, reason: row.notLiveReason }]));
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={draft === null ? "Submit a lead" : "Continue a draft"} description="Prospect details, the qualification answers, and one meeting time with the client people to invite. Save a draft with only a campaign and a name." />
      <SubmitLeadForm campaigns={options.campaigns} aliases={options.aliases} notLive={notLive} leadsHref="/coordinator/leads" teams={teams} draft={draft} />
    </div>
  );
}

export default function CoordinatorSubmitLeadPage({ searchParams }: PageProps<"/coordinator/leads/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubmitLead searchParams={searchParams} />
    </Suspense>
  );
}
