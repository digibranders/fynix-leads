import { ClockCounterClockwise, Megaphone, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { When } from "@/components/kit/when";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { auditSentence } from "@/lib/fynix/audit-text";
import type { ActivityRow } from "@/server/domain/people-overview";

export interface CampaignLine {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  /** The other side of the campaign: the coordinator on a client's page, the client on a coordinator's. */
  readonly other: string;
}

/** A record's campaigns, each linking to the campaign with its status. */
/** `newHref` is the New campaign page with this record chosen; it is given only to an admin. */
export function CampaignsPanel({ rows, newHref }: { rows: readonly CampaignLine[]; newHref?: string }) {
  return (
    <Panel aria-label="Campaigns">
      <PanelHeader
        title="Campaigns"
        count={rows.length}
        action={
          newHref === undefined ? null : (
            <Link href={newHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Plus aria-hidden />
              New campaign
            </Link>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet">
          {newHref === undefined ? "Campaigns are created from the Campaigns page." : "Use New campaign to set up the first one."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col pb-3">
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={
                <Link href={`/fynix/campaigns/${row.publicRef}`} className="rounded-xs hover:underline">
                  {row.name}
                </Link>
              }
              sub={row.other}
              trailing={<StatusChip kind="campaign" status={row.status} size="sm" />}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The recorded changes to a record, newest first, each with who made it and when. */
export function ActivityPanel({ rows }: { rows: readonly ActivityRow[] }) {
  return (
    <Panel aria-label="Activity">
      <PanelHeader title="Activity" count={rows.length} />
      {rows.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="Nothing recorded yet">
          Changes made here by Fynix show in this list.
        </EmptyState>
      ) : (
        <ul className="flex flex-col pb-3">
          {rows.map((row) => (
            <ListRow key={row.id} title={auditSentence(row.action)} sub={row.by === null ? "A Fynix admin" : row.by} trailing={<When at={row.at} style="day" />} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
