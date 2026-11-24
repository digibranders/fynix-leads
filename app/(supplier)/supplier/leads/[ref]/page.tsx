import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { LeadRecordView } from "@/components/leads/lead-record-view";
import { orNotFound, requireSupplier } from "@/server/supplier/session";
import { getDatabase } from "@/server/db/client";
import { getLeadRecordForSupply } from "@/server/domain/lead-record";

export const metadata: Metadata = { title: "Lead" };

async function Record({ params }: { params: PageProps<"/supplier/leads/[ref]">["params"] }) {
  const view = await requireSupplier();
  const { ref } = await params;
  const record = await orNotFound(getLeadRecordForSupply(getDatabase("leads_agency").db, view.actor, ref));
  const extraFacts = [["Sent by", record.source.own ? "Your team" : (record.source.name ?? "A partner agency")]] as const;
  return <LeadRecordView record={record} viewer="supply" backHref="/supplier/leads" extraFacts={extraFacts} now={new Date()} isCoordinator draftHref={`/supplier/leads/new?draft=${record.publicRef}`} />;
}

export default function SupplierLeadPage({ params }: PageProps<"/supplier/leads/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Record params={params} />
    </Suspense>
  );
}
