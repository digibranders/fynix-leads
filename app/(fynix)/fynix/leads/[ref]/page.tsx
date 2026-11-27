import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { getDomain } from "@/server/domain";
import { loadCampaignTeamsForFynix } from "@/server/domain/lead-form-data";
import { listMeetingJoinsForFynix } from "@/server/domain/meeting-joins";
import { getLeadRecordForFynix } from "@/server/domain/lead-record";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/fynix/leads/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForFynix(getDomain(), view.actor, ref));
  const joins = await listMeetingJoinsForFynix(getDomain(), view.actor, record.meeting === null ? [] : [record.meeting.id]);
  const canMove = record.stage === "reschedule_needed" || record.stage === "scheduled";
  const teamPeople = canMove ? (await loadCampaignTeamsForFynix(getDomain(), view.actor, [record.campaignId]))[record.campaignId] : undefined;
  const extraFacts = [
    ["Client", record.clientName],
    ["Sent by", record.source.name],
    ...(record.aliasEmail === null ? [] : ([["Alias email", record.aliasEmail]] as const)),
    ...(record.countedMonth === null ? [] : ([["Counts in", record.countedMonth]] as const)),
  ] as const;
  return <LeadRecordView record={record} joins={joins} viewer="fynix" teamPeople={teamPeople} backHref="/fynix/leads" extraFacts={extraFacts} now={new Date()} />;
}

export default function FynixLeadPage({ params }: PageProps<"/fynix/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
