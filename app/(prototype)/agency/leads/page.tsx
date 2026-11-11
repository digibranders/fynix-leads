import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { AgencyLeadsView } from "@/components/leads/agency-leads-view";
import { CampaignHero } from "@/components/leads/campaign-hero";
import { MonthTile, StatTiles } from "@/components/leads/stat-tiles";
import { PageHeader } from "@/components/shell/page-header";
import { campaignStats, replacementsOwedRefs } from "@/lib/campaign/stats";
import { toAgencyView } from "@/lib/leads/agency-view";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";
import { formatIsoDay, formatMonthYear } from "@/lib/time/iso-day";

export default function AgencyLeadsPage() {
  // Everything below runs on the server. Only the role-shaped leads and plain numbers cross to the browser.
  const leads = SAMPLE_LEADS.map(toAgencyView);
  const stats = campaignStats(SAMPLE_LEADS, SAMPLE_NOW);
  const replacementRefs = replacementsOwedRefs(SAMPLE_LEADS);
  const { name, brand, ref, startsOn, endsOn, monthlyTarget, totalTarget } = SAMPLE_CAMPAIGN;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{name}</span>
            <span className="text-ink-muted">{brand}</span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-navy-05 px-2 font-mono text-caption font-medium text-ink-2">{ref}</span>
            <span className="inline-flex items-center gap-[7px] text-ink-muted">
              <CalendarBlank aria-hidden size={16} />
              {formatIsoDay(startsOn)} to {formatIsoDay(endsOn)}
            </span>
          </span>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <CampaignHero delivered={stats.deliveredToDate} totalTarget={totalTarget} monthlyTarget={monthlyTarget} />
        <div className="grid gap-4 xl:grid-rows-[auto_1fr]">
          <MonthTile delivered={stats.deliveredThisMonth} target={monthlyTarget} monthLabel={formatMonthYear(SAMPLE_NOW)} />
          <StatTiles stats={stats} replacementRefs={replacementRefs} />
        </div>
      </div>

      <div className="mt-4">
        <AgencyLeadsView leads={leads} zone={VIEWER_ZONES.agency} now={SAMPLE_NOW.toISOString()} />
      </div>
    </>
  );
}
