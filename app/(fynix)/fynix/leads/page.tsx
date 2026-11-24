import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { FynixLeadsView } from "@/components/leads/fynix-leads-view";
import { parseCampaignFilter } from "@/lib/campaign-status";
import { parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { listFynixLeads } from "@/server/domain/leads";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Leads" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Leads({ searchParams }: { searchParams: PageProps<"/fynix/leads">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const [all, campaigns] = await Promise.all([listFynixLeads(getDatabase("leads_fynix").db, view.actor), listCampaignRows(getDomain(), view.actor)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leads" description="Qualified leads across all campaigns, from submission to acceptance." />
      <FynixLeadsView
        leads={all}
        basePath="/fynix/leads"
        group={parseGroup(params.stage)}
        q={one(params.q) ?? ""}
        page={parsePage(params.page)}
        campaigns={campaigns}
        campaign={parseCampaignFilter(params.campaign, campaigns)}
        emptyText="As partner agencies and coordinators submit qualified prospects, they will appear here across all campaigns."
      />
    </div>
  );
}

export default function FynixLeadsPage({ searchParams }: PageProps<"/fynix/leads">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}
