import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { orNotFound, requireCoordinator } from "@/server/coordinator/session";
import { getDatabase } from "@/server/db/client";
import { listMeetingJoins } from "@/server/domain/meeting-joins";
import { getLeadRecordForSupply } from "@/server/domain/lead-record";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/coordinator/leads/[ref]">["params"] }) {
  const view = await requireCoordinator();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForSupply(getDatabase("leads_agency").db, view.actor, ref));
  const joins = await listMeetingJoins(getDatabase("leads_agency").db, view.actor, record.meeting === null ? [] : [record.meeting.id]);
  const extraFacts = [["Sent by", record.source.own ? "Your team" : (record.source.name ?? "A partner agency")]] as const;
  return <LeadRecordView record={record} joins={joins} viewer="supply" backHref="/coordinator/leads" extraFacts={extraFacts} now={new Date()} isCoordinator draftHref={`/coordinator/leads/new?draft=${record.publicRef}`} />;
}

export default function CoordinatorLeadPage({ params }: PageProps<"/coordinator/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
