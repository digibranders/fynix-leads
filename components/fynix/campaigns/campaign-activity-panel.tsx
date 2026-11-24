import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { activityLine } from "@/lib/fynix/campaign-activity-text";
import type { CampaignActivityRow } from "@/server/domain/campaign-activity";

/** Everything recorded about a campaign, newest first: Fynix changes and the steps of its leads, each with who and when. */
export function CampaignActivityPanel({ rows }: { rows: readonly CampaignActivityRow[] }) {
  return (
    <Panel aria-label="Campaign activity">
      <PanelHeader title="Activity" count={rows.length} />
      {rows.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="Nothing recorded yet">
          Changes to this campaign and to its leads show in this list.
        </EmptyState>
      ) : (
        <ul className="flex flex-col pb-3">
          {rows.map((row) => {
            const line = activityLine(row);
            const who = row.by ?? (row.source === "audit" ? "A Fynix admin" : "The portal");
            return <ListRow key={`${row.source}-${row.id}`} title={line.title} sub={line.detail === null ? who : `${who}. ${line.detail}`} trailing={<When at={row.at} style="day" />} />;
          })}
        </ul>
      )}
    </Panel>
  );
}
