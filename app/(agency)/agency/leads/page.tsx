import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { SourceLeadsView } from "@/components/leads/source-leads-view";
import { buttonVariants } from "@/components/ui/button";
import { parseCampaignFilter } from "@/lib/campaign-status";
import { parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import { getDatabase } from "@/server/db/client";
import { listAliasIdentities } from "@/server/domain/alias-identity";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listAgencyDrafts, listAgencyLeads } from "@/server/domain/leads";
import { parseSort } from "@/lib/leads/sort";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Leads" };

const BASE = "/agency/leads";
const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Leads({ searchParams }: { searchParams: PageProps<"/agency/leads">["searchParams"] }) {
  const view = await requireAgency();
  const params = await searchParams;
  const db = getDatabase("leads_agency").db;
  const [leads, drafts, campaigns, aliases] = await Promise.all([listAgencyLeads(db, view.actor), listAgencyDrafts(db, view.actor), listTenantCampaigns(db, view.actor, "agency"), listAliasIdentities(db, view.actor)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Every prospect you have submitted, across your campaigns and stages."
        actions={
          <Link href="/agency/leads/new" className={buttonVariants({ variant: "default" })}>
            <Plus aria-hidden weight="bold" />
            Submit lead
          </Link>
        }
      />
      <SourceLeadsView
        leads={leads}
        basePath={BASE}
        submitHref="/agency/leads/new"
        emptyText="Submit a qualified prospect with the qualification answers and proposed meeting times. It appears here as it moves."
        group={parseGroup(params.stage)}
        q={one(params.q) ?? ""}
        page={parsePage(params.page)}
        ownOrgId={view.actor.orgId}
        campaigns={Object.fromEntries(campaigns.map((row) => [row.id, { name: row.name, brand: row.clientBrandName }]))}
        campaignChoices={campaigns}
        campaign={parseCampaignFilter(params.campaign, campaigns)}
        aliasNames={Object.fromEntries(aliases.map((alias) => [alias.id, alias.displayName]))}
        drafts={drafts}
        showDrafts={one(params.show) === "drafts"}
        sort={parseSort(params.sort)}
      />
    </div>
  );
}

export default function AgencyLeadsPage({ searchParams }: PageProps<"/agency/leads">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}
