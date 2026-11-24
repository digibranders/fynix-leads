import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { getDomain } from "@/server/domain";
import { getLeadRecordForFynix } from "@/server/domain/lead-record";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/fynix/leads/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForFynix(getDomain(), view.actor, ref));
  const extraFacts = [
    ["Client", record.clientName],
    ["Sent by", record.source.name],
    ...(record.aliasEmail === null ? [] : ([["Alias email", record.aliasEmail]] as const)),
    ...(record.countedMonth === null ? [] : ([["Counts in", record.countedMonth]] as const)),
  ] as const;
  return <LeadRecordView record={record} viewer="fynix" backHref="/fynix/leads" extraFacts={extraFacts} now={new Date()} />;
}

export default function FynixLeadPage({ params }: PageProps<"/fynix/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
