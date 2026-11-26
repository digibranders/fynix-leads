import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { orNotFound, requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { loadCampaignTeams } from "@/server/domain/lead-form-data";
import { listMeetingJoins } from "@/server/domain/meeting-joins";
import { getLeadRecordForClient } from "@/server/domain/lead-record";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/client/leads/[ref]">["params"] }) {
  const view = await requireClient();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForClient(getDatabase("leads_client").db, view.actor, ref));
  const joins = await listMeetingJoins(getDatabase("leads_client").db, view.actor, record.meeting === null ? [] : [record.meeting.id]);
  // The client team is read only where the client may book a new time.
  const canMove = record.stage === "reschedule_needed" || record.stage === "scheduled";
  const teamPeople = canMove ? (await loadCampaignTeams(getDatabase("leads_client").db, getDomain(), view.actor, [record.campaignId]))[record.campaignId] : undefined;
  return <LeadRecordView record={record} joins={joins} teamPeople={teamPeople} viewer="client" backHref="/client/leads" availabilityHref={`/client/review?lead=${record.id}`} now={new Date()} />;
}

export default function ClientLeadPage({ params }: PageProps<"/client/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
