import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Megaphone, Scales } from "@phosphor-icons/react/dist/ssr";
import { SetupChecklist } from "@/components/fynix/setup-checklist";
import { EmptyState } from "@/components/kit/empty-state";
import { Hero } from "@/components/kit/hero";
import { ListRow } from "@/components/kit/list";
import { PageHeader } from "@/components/kit/page-header";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { StageBar } from "@/components/kit/stage-bar";
import { MiniStat } from "@/components/kit/stat";
import { StatusChip } from "@/components/kit/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { countByGroup, PIPELINE_GROUPS } from "@/lib/leads/pipeline";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { checklistItems } from "@/lib/fynix/setup-checklist";
import { readSetupFindings } from "@/server/domain/setup-overview";
import { getFynixOverviewMetrics } from "@/server/domain/analytics";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { listRejections } from "@/server/domain/rejection-overview";
import { listFynixLeads } from "@/server/domain/leads";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Overview" };

async function Overview() {
  const view = await requireFynix();
  const deps = getDomain();
  const [metrics, campaigns, allLeads, findings, rejectionRows] = await Promise.all([
    getFynixOverviewMetrics(deps.fynixDb, view.actor),
    listCampaignRows(deps, view.actor),
    listFynixLeads(getDatabase("leads_fynix").db, view.actor),
    readSetupFindings(deps, view.actor),
    listRejections(deps, view.actor),
  ]);
  const active = campaigns.filter((row) => row.status === "active");
  // An overview is about active campaigns: the stage bar and the latest leads leave out the rest.
  const activeIds = new Set(active.map((row) => row.id));
  const leads = allLeads.filter((lead) => activeIds.has(lead.campaignId));
  const counts = countByGroup(leads);
  const rejected = rejectionRows.length;
  const waiting = metrics.awaitingClientCount;

  const kicker = rejected > 0 ? "Needs a decision" : waiting > 0 ? "Waiting on clients" : "All clear";
  const title =
    rejected > 0
      ? `${rejected} ${rejected === 1 ? "rejection is" : "rejections are"} waiting for Fynix to read`
      : waiting > 0
        ? `${waiting} ${waiting === 1 ? "lead is" : "leads are"} waiting for a client`
        : "Nothing needs Fynix right now";
  const description =
    rejected > 0
      ? `A client rejected a lead after the meeting. Fynix can change it to accepted.${waiting > 0 ? ` ${waiting} more ${waiting === 1 ? "lead is" : "leads are"} waiting on a client.` : ""}`
      : waiting > 0
        ? "These leads are not yet accepted or rejected."
        : "No rejection is waiting and no lead is waiting on a client.";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Overview"
        description="Where every campaign stands today."
        actions={
          <Link href="/fynix/campaigns" className={buttonVariants({ variant: "secondary" })}>
            All campaigns
          </Link>
        }
      />

      <SetupChecklist items={checklistItems(findings)} />

      <Hero
        kicker={kicker}
        title={title}
        description={description}
        actions={
          rejected > 0 ? (
            <Link href="/fynix/rejections" className={buttonVariants({ variant: "peach", size: "lg" })}>
              <Scales aria-hidden weight="bold" />
              View rejections
            </Link>
          ) : waiting > 0 ? (
            <Link href="/fynix/leads?stage=awaiting" className={buttonVariants({ variant: "peach", size: "lg" })}>
              View leads
            </Link>
          ) : null
        }
        aside={
          <>
            <p className="text-label font-semibold text-peach">Accepted so far, active campaigns</p>
            <p className="text-display font-semibold tracking-figure">{metrics.deliveredCount}</p>
            <p className="text-body text-on-navy-text">{metrics.totalTargetCount > 0 ? `Combined monthly target, active campaigns: ${metrics.totalTargetCount} a month` : "No active campaign has a monthly target."}</p>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/fynix/campaigns" className="block rounded-lg">
          <MiniStat label="Active campaigns" value={metrics.activeCampaignsCount} foot={`of ${metrics.totalCampaignsCount} in all`} className="h-full" />
        </Link>
        <Link href="/fynix/leads?stage=awaiting" className="block rounded-lg">
          <MiniStat label="Waiting on a client" value={waiting} foot="Not yet accepted or rejected" className="h-full" />
        </Link>
        <Link href="/fynix/meetings" className="block rounded-lg">
          <MiniStat label="Meetings booked" value={metrics.scheduledCount} foot="Scheduled, not yet held" className="h-full" />
        </Link>
        <Link href="/fynix/leads" className="block rounded-lg">
          <MiniStat label="Over share" value={metrics.overShareCount} foot="Above an agency's monthly share" className="h-full" />
        </Link>
      </div>

      {leads.length > 0 ? (
        <StageBar
          allHref="/fynix/leads"
          allCount={leads.length}
          allActive={false}
          segments={PIPELINE_GROUPS.map((group) => ({
            key: group.key,
            label: group.label,
            count: counts[group.key],
            color: group.color,
            href: `/fynix/leads?stage=${group.key}`,
          }))}
        />
      ) : null}

      <Panel aria-label="Active campaigns">
        <PanelHeader
          title="Active campaigns"
          count={active.length}
          action={
            <Link href="/fynix/campaigns" className={buttonVariants({ variant: "ghost", size: "xs" })}>
              All campaigns
            </Link>
          }
        />
        {active.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaign is active">
            A campaign takes leads only while it is active.
          </EmptyState>
        ) : (
          <ul className="flex flex-col pb-3">
            {active.map((row) => (
              <ListRow
                key={row.id}
                title={
                  <Link href={`/fynix/campaigns/${row.publicRef}`} className="rounded-xs hover:underline">
                    {row.name}
                  </Link>
                }
                sub={`${row.clientName} via ${row.supplierName}`}
                trailing={<StatusChip kind="campaign" status={row.status} size="sm" />}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function FynixHome() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Overview />
    </Suspense>
  );
}
