import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaperPlaneRight, Table, UsersThree } from "@phosphor-icons/react/dist/ssr";
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
import { buttonVariants } from "@/components/ui/button";
import { countByGroup, PIPELINE_GROUPS } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { getSupplierOverviewMetrics } from "@/server/domain/analytics";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listAgencyLeads } from "@/server/domain/leads";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Overview" };

async function Overview() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const [metrics, allLeads, campaigns] = await Promise.all([getSupplierOverviewMetrics(db, view.actor), listAgencyLeads(db, view.actor), listTenantCampaigns(db, view.actor, "supplier")]);
  // An overview is about active campaigns: the stage bar and the latest leads leave out the rest.
  const activeIds = new Set(campaigns.filter((row) => row.status === "active").map((row) => row.id));
  const leads = allLeads.filter((lead) => activeIds.has(lead.campaignId));
  const counts = countByGroup(leads);
  const latest = leads.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Overview"
        description="Your delivery against target, and how your partner agencies are doing."
        actions={
          <Link href="/supplier/agencies" className={buttonVariants({ variant: "secondary" })}>
            Partner agencies
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
          <Link href="/supplier/leads/new" className={buttonVariants({ variant: "peach", size: "lg" })}>
            <PaperPlaneRight aria-hidden weight="bold" />
            Submit a lead
          </Link>
        }
        aside={
          <>
            <p className="text-label font-semibold text-peach">Accepted so far, active campaigns</p>
            <p className="text-display font-semibold tracking-figure">{metrics.deliveredCount}</p>
            <p className="text-body text-on-navy-text">{metrics.supplierTarget > 0 ? `Monthly target, active campaigns: ${metrics.supplierTarget} a month` : "No active campaign has a monthly target."}</p>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Awaiting client" value={metrics.awaitingClientCount} foot="Prospects pending a client response" tone="amber" />
        <MiniStat label="Over share" value={metrics.overShareCount} foot={metrics.overShareCount > 0 ? "Submitted above an allocated share" : "None above a share"} />
        <MiniStat label="Awaiting decision" value={counts.decision} foot={counts.decision > 0 ? "Meeting held, the client has not answered" : "None waiting"} />
      </div>

      {leads.length > 0 ? (
        <StageBar
          allHref="/supplier/leads"
          allCount={leads.length}
          allActive={false}
          segments={PIPELINE_GROUPS.map((group) => ({
            key: group.key,
            label: group.label,
            count: counts[group.key],
            color: group.color,
            href: `/supplier/leads?stage=${group.key}`,
          }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel aria-label="Partner agencies">
          <PanelHeader
            title="Partner agencies"
            action={
              <Link href="/supplier/campaigns" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                Manage shares
              </Link>
            }
          />
          {metrics.agencyBreakdown.length === 0 ? (
            <EmptyState icon={UsersThree} title="No shares allocated">
              When partner agencies are given campaign shares, their delivery appears here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {metrics.agencyBreakdown.map((item) => (
                <ListRow
                  key={item.agencyOrgId}
                  title={item.agencyOrgId === view.actor.orgId ? "Your own team" : item.agencyName}
                  sub={`${item.awaitingClientCount} awaiting, ${item.overShareCount} over share`}
                  trailing={
                    <span className="text-right text-body text-ink-muted">
                      <b className="font-semibold text-ink">{item.deliveredCount}</b> accepted, share {item.shareTarget} a month
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel aria-label="Latest leads">
          <PanelHeader
            title="Latest leads"
            action={
              <Link href="/supplier/leads" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                All leads
              </Link>
            }
          />
          {latest.length === 0 ? (
            <EmptyState icon={Table} title="No leads yet">
              Leads submitted by your team and your partner agencies appear here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {latest.map((lead) => (
                <ListRow
                  key={lead.id}
                  title={<Person name={lead.prospectName} href={`/supplier/leads/${lead.publicRef}`} sub={lead.prospectCompany} />}
                  trailing={<StatusChip kind="lead" status={lead.stage as LeadStage} size="sm" />}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function SupplierOverviewPage() {
  // The session read is in its own boundary: a layout does not run again on a client navigation, so the page must hold its own.
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Overview />
    </Suspense>
  );
}
