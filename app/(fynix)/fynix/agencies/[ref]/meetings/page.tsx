import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/kit/skeletons";
import { MEETING_SHOWS, PortalMeetings } from "@/components/meetings/portal-meetings";
import { parseCampaignFilter } from "@/lib/campaign-status";
import { parsePage } from "@/lib/leads/list";
import { parseSort } from "@/lib/leads/sort";
import { getDatabase } from "@/server/db/client";
import { listFynixMeetings } from "@/server/domain/meetings";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency meetings" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Meetings({ params, searchParams }: { params: PageProps<"/fynix/agencies/[ref]/meetings">["params"]; searchParams: PageProps<"/fynix/agencies/[ref]/meetings">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const query = await searchParams;
  const agency = await loadAgency(ref, view.actor.userId);
  const meetings = await listFynixMeetings(getDatabase("leads_fynix").db, view.actor, { sourceOrgId: agency.id });
  const campaigns = agency.campaigns.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  return (
    <PortalMeetings
      meetings={meetings}
      basePath={`/fynix/agencies/${agency.publicRef}/meetings`}
      show={MEETING_SHOWS.find((entry) => entry.key === one(query.show))?.key ?? null}
      q={one(query.q) ?? ""}
      page={parsePage(query.page)}
      sort={parseSort(query.sort)}
      campaigns={campaigns}
      campaign={parseCampaignFilter(query.campaign, campaigns)}
      exportSourceOrgId={agency.id}
      viewer="fynix"
      showHost
      canWrite
      outcomeSide="fynix"
      now={new Date()}
      emptyText="Meetings of the leads this agency sent appear here once a client accepts a time."
    />
  );
}

export default function AgencyMeetingsPage({ params, searchParams }: PageProps<"/fynix/agencies/[ref]/meetings">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <Meetings params={params} searchParams={searchParams} />
    </Suspense>
  );
}
