import { PageHeader } from "@/components/kit/page-header";
import { StatusChip } from "@/components/kit/status-chip";
import { meetingLength, zoneCity } from "@/lib/fynix/format";
import type { CampaignHeader } from "@/server/domain/campaign-overview";
import { EditCampaignButton } from "./campaign-edit-actions";
import { CampaignTabs } from "./campaign-tabs";

/** The campaign's title block: its name and status, who it is for and who serves it, its time zone and meeting length, then the four sub-pages. */
export function CampaignTitle({ campaign, canWrite = false }: { campaign: CampaignHeader; canWrite?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip kind="campaign" status={campaign.status} />
            <span>
              {campaign.clientName}, served by {campaign.supplierName}
            </span>
            <span className="font-mono text-caption">{campaign.publicRef}</span>
            <span>
              {zoneCity(campaign.timeZone)}, {meetingLength(campaign.meetingMinutes)}
            </span>
          </span>
        }
        actions={canWrite ? <EditCampaignButton campaign={campaign} /> : null}
      />
      <CampaignTabs reference={campaign.publicRef} hostCount={campaign.activeHostCount} />
    </div>
  );
}
