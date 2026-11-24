import { PageHeader } from "@/components/kit/page-header";
import { StatusChip } from "@/components/kit/status-chip";
import { isClosed } from "@/lib/campaign-status";
import { Button } from "@/components/ui/button";
import { formatDate, meetingLength, zoneCity } from "@/lib/fynix/format";
import type { CampaignHeader } from "@/server/domain/campaign-overview";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { EditCampaignButton } from "./campaign-edit-actions";
import { CloseCampaignButton, MakeActiveButton, ReopenButton } from "./campaign-lifecycle-actions";
import { CampaignTabs } from "./campaign-tabs";

/** What an admin can do to the campaign's status: make a campaign being set up active, close one that is not closed, reopen a closed one. Edit is off while it is closed. */
function Actions({ campaign }: { campaign: CampaignHeader }) {
  const closed = isClosed(campaign.status);
  return (
    <div className="flex flex-wrap items-start gap-2">
      {campaign.status === "draft" ? <MakeActiveButton campaignId={campaign.id} /> : null}
      {closed ? <ReopenButton campaignId={campaign.id} /> : <CloseCampaignButton campaignId={campaign.id} name={campaign.name} />}
      {closed ? (
        <Button variant="secondary" size="sm" disabled title="Reopen the campaign to edit it">
          <PencilSimple aria-hidden />
          Edit campaign
        </Button>
      ) : (
        <EditCampaignButton campaign={campaign} />
      )}
    </div>
  );
}

/** The campaign's title block: its name and status, who it is for and who serves it, its time zone and meeting length, then the sub-pages. */
export function CampaignTitle({ campaign, canWrite = false }: { campaign: CampaignHeader; canWrite?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip kind="campaign" status={campaign.status} />
            {campaign.closedAt !== null && isClosed(campaign.status) ? <span>Closed on {formatDate(campaign.closedAt, campaign.timeZone)}</span> : null}
            <span>
              {campaign.clientName}, served by {campaign.supplierName}
            </span>
            <span className="font-mono text-caption">{campaign.publicRef}</span>
            <span>
              {zoneCity(campaign.timeZone)}, {meetingLength(campaign.meetingMinutes)}
            </span>
          </span>
        }
        actions={canWrite ? <Actions campaign={campaign} /> : null}
      />
      <CampaignTabs reference={campaign.publicRef} hostCount={campaign.activeHostCount} />
    </div>
  );
}
