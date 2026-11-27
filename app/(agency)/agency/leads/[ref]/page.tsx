import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { orNotFound, requireAgency } from "@/server/agency/session";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { loadCampaignTeams } from "@/server/domain/lead-form-data";
import { listMeetingJoins } from "@/server/domain/meeting-joins";
import { getLeadRecordForSupply } from "@/server/domain/lead-record";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/agency/leads/[ref]">["params"] }) {
  const view = await requireAgency();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForSupply(getDatabase("leads_agency").db, view.actor, ref));
  const joins = await listMeetingJoins(getDatabase("leads_agency").db, view.actor, record.meeting === null ? [] : [record.meeting.id]);
  // The client team is read only where the source may book a new time.
  const canRebook = record.source.own && (record.stage === "reschedule_needed" || record.stage === "scheduled");
  const teamPeople = canRebook ? (await loadCampaignTeams(getDatabase("leads_agency").db, getDomain(), view.actor, [record.campaignId]))[record.campaignId] : undefined;
  const extraFacts = [["Sent by", record.source.own ? "Your team" : (record.source.name ?? "A partner agency")]] as const;
  return <LeadRecordView record={record} joins={joins} viewer="supply" draftHref={`/agency/leads/new?draft=${record.publicRef}`} backHref="/agency/leads" extraFacts={extraFacts} now={new Date()} teamPeople={teamPeople} />;
}

export default function AgencyLeadPage({ params }: PageProps<"/agency/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
