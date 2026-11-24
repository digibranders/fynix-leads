import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaperPlaneRight, Table } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Hero } from "@/components/kit/hero";
import { ListRow } from "@/components/kit/list";
import { PageHeader } from "@/components/kit/page-header";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { PageSkeleton } from "@/components/kit/skeletons";
import { StageBar } from "@/components/kit/stage-bar";
import { MiniStat } from "@/components/kit/stat";
import { StatusChip } from "@/components/kit/status-chip";
import { When } from "@/components/kit/when";
import { buttonVariants } from "@/components/ui/button";
import { countByGroup, PIPELINE_GROUPS } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { getAgencyOverviewMetrics } from "@/server/domain/analytics";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listAgencyLeads } from "@/server/domain/leads";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Overview" };

async function Overview() {
  const view = await requireAgency();
  const db = getDatabase("leads_agency").db;
  const [metrics, allLeads, campaigns] = await Promise.all([getAgencyOverviewMetrics(db, view.actor), listAgencyLeads(db, view.actor), listTenantCampaigns(db, view.actor, "agency")]);
  // An overview is about active campaigns: the stage bar and the latest leads leave out the rest.
  const activeIds = new Set(campaigns.filter((row) => row.status === "active").map((row) => row.id));
  const leads = allLeads.filter((lead) => activeIds.has(lead.campaignId));
  const counts = countByGroup(leads);
  const latest = leads.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Overview"
        description="Your monthly share, and the leads you have submitted."
        actions={
          <Link href="/agency/leads" className={buttonVariants({ variant: "secondary" })}>
            All leads
          </Link>
        }
      />

      <Hero
        kicker={metrics.awaitingClientCount > 0 ? "With the client" : "All clear"}
        title={
          metrics.awaitingClientCount > 0
            ? `${metrics.awaitingClientCount} ${metrics.awaitingClientCount === 1 ? "lead is" : "leads are"} waiting for a client response`
            : "No lead is waiting on a client"
        }
        description="Submit qualified prospects for your campaigns, with proposed meeting times, and follow them here."
        actions={
          <Link href="/agency/leads/new" className={buttonVariants({ variant: "peach", size: "lg" })}>
            <PaperPlaneRight aria-hidden weight="bold" />
            Submit a lead
          </Link>
        }
        aside={
          <>
            <p className="text-label font-semibold text-peach">Delivered, active campaigns</p>
            <p className="text-display font-semibold tracking-figure">{metrics.deliveredCount}</p>
            <p className="text-body text-on-navy-text">{metrics.agencyShareTarget > 0 ? `Your monthly share, active campaigns: ${metrics.agencyShareTarget} a month` : "No active campaign has a share for you."}</p>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Awaiting response" value={metrics.awaitingClientCount} foot="Prospects pending client review" tone="amber" />
        <MiniStat label="Over share" value={metrics.overShareCount} foot={metrics.overShareCount > 0 ? "Submitted beyond your share" : "None beyond your share"} />
        <MiniStat label="Disputes" value={metrics.disputedCount} foot={metrics.disputedCount > 0 ? "Under review by Fynix" : "None open"} tone="red" />
      </div>

      {leads.length > 0 ? (
        <StageBar
          allHref="/agency/leads"
          allCount={leads.length}
          allActive={false}
          segments={PIPELINE_GROUPS.map((group) => ({
            key: group.key,
            label: group.label,
            count: counts[group.key],
            color: group.color,
            href: `/agency/leads?stage=${group.key}`,
          }))}
        />
      ) : null}

      <Panel aria-label="Latest leads">
        <PanelHeader
          title="Latest leads"
          action={
            leads.length > 0 ? (
              <Link href="/agency/leads" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                All leads ({leads.length})
              </Link>
            ) : undefined
          }
        />
        {latest.length === 0 ? (
          <EmptyState icon={Table} title="No leads submitted yet">
            New lead submissions and meeting times appear here as they move.
          </EmptyState>
        ) : (
          <ul className="flex flex-col pb-3">
            {latest.map((lead) => (
              <ListRow
                key={lead.id}
                title={<Person name={lead.prospectName} sub={`${lead.prospectCompany}, ${lead.publicRef}`} />}
                trailing={
                  <span className="flex items-center gap-3">
                    <span className="text-caption max-sm:hidden">
                      <When at={lead.submittedAt} style="day" />
                    </span>
                    <StatusChip kind="lead" status={lead.stage as LeadStage} size="sm" />
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function AgencyOverviewPage() {
  // The session read is in its own boundary: a layout does not run again on a client navigation, so the page must hold its own.
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Overview />
    </Suspense>
  );
}
