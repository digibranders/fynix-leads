import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/kit/skeletons";
import { MEETING_SHOWS, PortalMeetings } from "@/components/meetings/portal-meetings";
import { parsePage } from "@/lib/leads/list";
import { getDatabase } from "@/server/db/client";
import { listFynixMeetings } from "@/server/domain/meetings";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign meetings" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Meetings({ params, searchParams }: { params: PageProps<"/fynix/campaigns/[ref]/meetings">["params"]; searchParams: PageProps<"/fynix/campaigns/[ref]/meetings">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const query = await searchParams;
  const campaign = await loadCampaign(ref, view.actor.userId);
  const meetings = (await listFynixMeetings(getDatabase("leads_fynix").db, view.actor)).filter((meeting) => meeting.campaignId === campaign.id);
  return (
    <PortalMeetings
      meetings={meetings}
      basePath={`/fynix/campaigns/${campaign.publicRef}/meetings`}
      show={MEETING_SHOWS.find((entry) => entry.key === one(query.show))?.key ?? null}
      q={one(query.q) ?? ""}
      page={parsePage(query.page)}
      canWrite={false}
      now={new Date()}
      emptyText="Meetings for this campaign appear here once a client accepts a time."
    />
  );
}

export default function CampaignMeetingsPage({ params, searchParams }: PageProps<"/fynix/campaigns/[ref]/meetings">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <Meetings params={params} searchParams={searchParams} />
    </Suspense>
  );
}
