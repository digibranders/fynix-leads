import type { Metadata } from "next";
import { Suspense } from "react";
import { RejectionsTable } from "@/components/fynix/rejections/rejections-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listRejections } from "@/server/domain/rejection-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Rejections" };

async function Rejections() {
  const view = await requireFynix();
  const rows = await listRejections(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rejections"
        description={rows.length === 0 ? "Leads a client rejected after the meeting wait here for Fynix to read." : `${rows.length} ${rows.length === 1 ? "lead was" : "leads were"} rejected after the meeting. Open one to read the note and, if Fynix disagrees, change it to accepted.`}
      />
      <RejectionsTable rows={rows} now={new Date()} />
    </div>
  );
}

export default function RejectionsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Rejections />
    </Suspense>
  );
}
