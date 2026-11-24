import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { PortalMeetings, MEETING_SHOWS, meetingsSummary } from "@/components/meetings/portal-meetings";
import { parseCampaignFilter } from "@/lib/campaign-status";
import { parsePage } from "@/lib/leads/list";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listAgencyMeetings } from "@/server/domain/meetings";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Meetings" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);
const EMPTY = "Meetings confirmed by clients appear here with calendar downloads and Google Meet links.";

async function Meetings({ searchParams }: { searchParams: PageProps<"/agency/meetings">["searchParams"] }) {
  const view = await requireAgency();
  const params = await searchParams;
  const db = getDatabase("leads_agency").db;
  const [meetings, campaigns] = await Promise.all([listAgencyMeetings(db, view.actor), listTenantCampaigns(db, view.actor, "agency")]);
  const now = new Date();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Meetings" description={meetingsSummary(meetings, now, "Meetings for your qualified prospects appear here once a client confirms a time.")} />
      <PortalMeetings
        meetings={meetings}
        basePath="/agency/meetings"
        show={MEETING_SHOWS.find((entry) => entry.key === one(params.show))?.key ?? null}
        q={one(params.q) ?? ""}
        page={parsePage(params.page)}
        canWrite={view.canWrite}
        now={now}
        emptyText={EMPTY}
        campaigns={campaigns}
        campaign={parseCampaignFilter(params.campaign, campaigns)}
      />
    </div>
  );
}

export default function AgencyMeetingsPage({ searchParams }: PageProps<"/agency/meetings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings searchParams={searchParams} />
    </Suspense>
  );
}
