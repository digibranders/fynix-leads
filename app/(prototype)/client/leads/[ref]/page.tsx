import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LeadRecord } from "@/components/leads/lead-record";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";

// Prototype data is static, so every sample lead is prerendered. Unknown refs render on demand and reach notFound().
export function generateStaticParams(): { ref: string }[] {
  return SAMPLE_LEADS.map((l) => ({ ref: l.ref }));
}

async function Record({ params }: { params: PageProps<"/client/leads/[ref]">["params"] }) {
  const { ref } = await params;
  const lead = SAMPLE_LEADS.find((l) => l.ref === ref);
  if (!lead) notFound();
  return <LeadRecord lead={lead} now={SAMPLE_NOW.toISOString()} viewerZone={VIEWER_ZONES.client} />;
}

export default function LeadRecordPage({ params }: PageProps<"/client/leads/[ref]">) {
  return (
    <Suspense fallback={null}>
      <Record params={params} />
    </Suspense>
  );
}
