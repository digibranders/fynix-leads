import Link from "next/link";
import { meetingLength, zoneCity } from "@/lib/fynix/format";
import type { CampaignHeader } from "@/server/domain/campaign-overview";
import { StatusChip } from "../status-chip";
import { EditCampaignButton } from "./campaign-edit-actions";
import { CampaignTabs } from "./campaign-tabs";

/** The campaign's title block: where it sits, its status, who it is for and who serves it, its time zone and meeting length, then the tabs. */
export function CampaignTitle({ campaign, canWrite = false }: { campaign: CampaignHeader; canWrite?: boolean }) {
  return (
    <header className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="min-w-0">
        <p className="text-body text-ink-2">
          <Link href="/fynix/campaigns" className="rounded-xs hover:underline">
            Campaigns
          </Link>
          <span aria-hidden className="px-2">
            /
          </span>
          <span className="font-mono">{campaign.publicRef}</span>
        </p>
        <h1 className="mt-0.5 text-title font-semibold tracking-title text-balance text-ink">{campaign.name}</h1>
       </div>
       {canWrite ? <EditCampaignButton campaign={campaign} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-ink-2">
        <StatusChip kind="campaign" status={campaign.status} />
        <span>
          {campaign.clientName}, served by {campaign.supplierName}
        </span>
        <span className="text-ink-muted">
          {zoneCity(campaign.timeZone)}, {meetingLength(campaign.meetingMinutes)}
        </span>
      </div>
      <CampaignTabs reference={campaign.publicRef} hostCount={campaign.activeHostCount} />
    </header>
  );
}
