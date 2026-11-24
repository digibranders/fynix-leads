import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarBlank, Table, Tray } from "@phosphor-icons/react/dist/ssr";
import { CampaignFilter } from "@/components/kit/campaign-filter";
import { EmptyState } from "@/components/kit/empty-state";
import { Hero } from "@/components/kit/hero";
import { ListRow, DateTile } from "@/components/kit/list";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { StageBar } from "@/components/kit/stage-bar";
import { MiniStat } from "@/components/kit/stat";
import { StatusChip } from "@/components/kit/status-chip";
import { When } from "@/components/kit/when";
import { buttonVariants } from "@/components/ui/button";
import { campaignFilterHrefs, parseCampaignFilter } from "@/lib/campaign-status";
import type { LeadStage } from "@/lib/leads/stage";
import { clientQueueCount } from "@/lib/leads/decision-queue";
import { countByGroup, PIPELINE_GROUPS } from "@/lib/leads/pipeline";
import { formatWaiting } from "@/lib/time/age";
import { getDatabase } from "@/server/db/client";
import { getClientOverviewMetrics } from "@/server/domain/analytics";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listClientLeads } from "@/server/domain/leads";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Overview" };

const byTime = (a: { when: Date }, b: { when: Date }) => a.when.getTime() - b.when.getTime();

async function Overview({ searchParams }: { searchParams: PageProps<"/client">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const db = getDatabase("leads_client").db;
  const [allLeads, campaigns] = await Promise.all([listClientLeads(db, view.actor), listTenantCampaigns(db, view.actor, "client")]);
  // The overview is about active campaigns. With more than one, a switcher picks one; a stale or closed campaign in the address shows all of them.
  const active = campaigns.filter((row) => row.status === "active");
  const chosen = parseCampaignFilter(params.campaign, active);
  const metrics = await getClientOverviewMetrics(db, view.actor, chosen ?? undefined);
  const inScope = new Set(chosen === null ? active.map((row) => row.id) : [chosen]);
  const leads = allLeads.filter((lead) => inScope.has(lead.campaignId));
  const now = new Date();

  const awaiting = leads
    .filter((lead) => lead.stage === "awaiting_client")
    .map((lead) => ({ lead, when: new Date(lead.submittedAt) }))
    .sort(byTime);
  const oldest = awaiting[0];
  const upcoming = leads
    .filter((lead) => lead.stage === "scheduled" && lead.scheduledMeetingTime)
    .map((lead) => ({ lead, when: new Date(lead.scheduledMeetingTime as Date | string) }))
    .sort(byTime)
    .slice(0, 4);
  // A booked meeting whose time has passed is waiting for its outcome, the same rule as the meetings screen.
  const outcomeDue = leads.filter((lead) => lead.stage === "outcome_due" || (lead.stage === "scheduled" && lead.scheduledMeetingTime !== null && new Date(lead.scheduledMeetingTime).getTime() <= now.getTime()));
  const latest = [...leads].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5);
  const counts = countByGroup(leads);
  // Both queues: leads waiting for a time and leads waiting for accept or reject.
  const waiting = clientQueueCount(leads);
  const decisionWaiting = counts.decision;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Overview"
        description={active.length > 1 && chosen === null ? "Where your active campaigns stand today." : "Where your campaign stands today."}
        actions={
          <Link href="/client/leads" className={buttonVariants({ variant: "secondary" })}>
            All leads
          </Link>
        }
      />
      {active.length > 1 ? (
        <CampaignFilter campaigns={active} selected={chosen} allLabel="All active campaigns" {...campaignFilterHrefs(active, (id) => (id === null ? "/client" : `/client?campaign=${id}`))} />
      ) : null}

      <Hero
        kicker={waiting > 0 ? "Needs your response" : "All clear"}
        title={waiting > 0 ? `${waiting} ${waiting === 1 ? "lead is" : "leads are"} waiting for you` : "Nothing is waiting for you"}
        description={
          oldest
            ? `The oldest was submitted ${formatWaiting(oldest.when, now)} ago, from ${oldest.lead.prospectCompany}.${decisionWaiting > 0 ? ` ${decisionWaiting} ${decisionWaiting === 1 ? "lead is" : "leads are"} waiting for you to accept or reject.` : ""}`
            : decisionWaiting > 0
              ? `${decisionWaiting} ${decisionWaiting === 1 ? "lead is" : "leads are"} waiting for you to accept or reject.`
              : "New qualified leads will appear here for your response."
        }
        actions={
          waiting > 0 ? (
            <Link href="/client/review" className={buttonVariants({ variant: "peach", size: "lg" })}>
              <Tray aria-hidden weight="bold" />
              Start answering
            </Link>
          ) : null
        }
        aside={
          <>
            <p className="text-label font-semibold text-peach">{chosen === null ? "Accepted so far, active campaigns" : "Accepted so far, this campaign"}</p>
            <p className="text-display font-semibold tracking-figure">{metrics.deliveredCount}</p>
            <p className="text-body text-on-navy-text">{metrics.targetCount > 0 ? `Monthly target, active campaigns: ${metrics.targetCount} a month` : "No active campaign has a monthly target."}</p>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat
          label="Meetings scheduled"
          value={metrics.scheduledCount}
          foot={upcoming[0] ? <>Next: <When at={upcoming[0].when} /></> : "None booked"}
        />
        <MiniStat label="Outcome due" value={outcomeDue.length} foot={outcomeDue.length > 0 ? "Meeting time has passed, record how it went" : "Nothing to record"} />
        <MiniStat label="Needs your answer" value={waiting} foot={waiting > 0 ? "A time to pick or a lead to accept or reject" : "Nothing waiting"} tone={waiting > 0 ? "amber" : undefined} />
      </div>

      {leads.length > 0 ? (
        <StageBar
          allHref="/client/leads"
          allCount={leads.length}
          allActive={false}
          segments={PIPELINE_GROUPS.map((group) => ({
            key: group.key,
            label: group.label,
            count: counts[group.key],
            color: group.color,
            href: `/client/leads?stage=${group.key}`,
          }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel aria-label="Upcoming meetings">
          <PanelHeader
            title="Upcoming meetings"
            action={
              <Link href="/client/meetings" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                All meetings
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarBlank} title="No meetings booked">
              When you accept a time, the meeting shows up here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {upcoming.map(({ lead, when }, index) => (
                <ListRow
                  key={lead.id}
                  highlight={index === 0}
                  leading={<DateTile date={when} />}
                  title={lead.prospectName}
                  sub={lead.prospectCompany}
                  trailing={<When at={when} style="time" />}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel aria-label="Latest leads">
          <PanelHeader
            title="Latest leads"
            action={
              <Link href="/client/leads" className={buttonVariants({ variant: "ghost", size: "xs" })}>
                All leads
              </Link>
            }
          />
          {latest.length === 0 ? (
            <EmptyState icon={Table} title="No leads yet">
              Qualified prospects appear here as soon as they are submitted for your campaign.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {latest.map((lead) => (
                <ListRow
                  key={lead.id}
                  title={<Person name={lead.prospectName} href={`/client/leads/${lead.publicRef}`} sub={lead.prospectCompany} />}
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

export default function ClientOverviewPage({ searchParams }: PageProps<"/client">) {
  // The session read is in its own boundary: a layout does not run again on a client navigation, so the page must hold its own.
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}
