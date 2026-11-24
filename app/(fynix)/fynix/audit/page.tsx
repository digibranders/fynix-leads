import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuditScreen } from "@/components/fynix/audit/audit-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseAuditFilter } from "@/lib/fynix/audit-filter";
import { getDomain } from "@/server/domain";
import { listAuditLog } from "@/server/domain/audit-overview";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Audit log" };

async function Audit({ searchParams }: { searchParams: PageProps<"/fynix/audit">["searchParams"] }) {
  const view = await requireFynix();
  // Admin only. Staff get the not-found page, as a person who is not a Fynix member would, and the read refuses them too.
  if (!view.canWrite) notFound();
  const filter = parseAuditFilter(await searchParams);
  const data = await orNotFound(listAuditLog(getDomain(), view.actor, filter));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" description="Every change a Fynix person made, newest first. Rows are never edited or removed." />
      <AuditScreen data={data} filter={filter} />
    </div>
  );
}

export default function AuditPage({ searchParams }: PageProps<"/fynix/audit">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}
