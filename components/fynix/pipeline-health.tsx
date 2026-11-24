import Link from "next/link";
import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { MiniStat } from "@/components/kit/stat";
import { ageText, deliveredText } from "@/lib/leads/health-text";
import type { PipelineHealth } from "@/server/domain/pipeline-health";

/**
 * Where the month is going, for the Fynix overview: per active campaign what is delivered against the one target and who delivered it, the lead that has
 * waited longest for a time, and the meetings whose outcome is overdue. Every figure links to the table behind it.
 */
export function PipelineHealthCards({ health }: { readonly health: PipelineHealth }) {
  const { oldestWaiting, overdueOutcomes } = health;
  const oldestOverdue = overdueOutcomes[0];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/fynix/leads?stage=awaiting&sort=submitted" className="block rounded-lg">
          <MiniStat
            label="Oldest lead waiting for a time"
            value={oldestWaiting === null ? "None" : ageText(oldestWaiting.waitingHours)}
            foot={oldestWaiting === null ? "No lead is waiting on a client" : `${oldestWaiting.leadRef} in ${oldestWaiting.campaignName}`}
            tone={oldestWaiting !== null && oldestWaiting.waitingHours >= 48 ? "amber" : "neutral"}
            className="h-full"
          />
        </Link>
        <Link href="/fynix/meetings?show=due&sort=meeting" className="block rounded-lg">
          <MiniStat
            label="Overdue outcomes"
            value={overdueOutcomes.length}
            foot={oldestOverdue === undefined ? "Every held meeting has an outcome" : `Oldest ${oldestOverdue.leadRef}, ${ageText(oldestOverdue.overdueHours)} overdue`}
            className="h-full"
          />
        </Link>
      </div>

      <Panel aria-label="Delivered this month">
        <PanelHeader title="Delivered this month" count={health.campaigns.length} />
        {health.campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaign is active">
            Delivered leads show here against each active campaign&apos;s target.
          </EmptyState>
        ) : (
          <ul className="flex flex-col pb-3">
            {health.campaigns.map((row) => (
              <ListRow
                key={row.campaignId}
                title={
                  <Link href={`/fynix/leads?campaign=${row.campaignId}`} className="rounded-xs hover:underline">
                    {row.campaignName}
                  </Link>
                }
                sub={
                  row.byAgency.length === 0
                    ? `${row.clientName}, nothing sent yet`
                    : `${row.clientName}. ${row.byAgency.map((agency) => `${agency.agencyName} ${deliveredText(agency.delivered, agency.share)}`).join(", ")}`
                }
                trailing={<span className="font-semibold text-ink">{deliveredText(row.delivered, row.target)}</span>}
              />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
