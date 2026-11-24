import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { NoticesView, parseNoticesTab } from "@/components/notices/notices-view";
import { requireSupplier } from "@/server/supplier/session";
import { getDatabase } from "@/server/db/client";
import { loadNoticesPage } from "@/server/domain/notice-page";

export const metadata: Metadata = { title: "Notices" };

async function Notices({ searchParams }: { searchParams: PageProps<"/supplier/notices">["searchParams"] }) {
  const view = await requireSupplier();
  const tab = parseNoticesTab((await searchParams).show);
  const page = await loadNoticesPage(getDatabase("leads_agency").db, view.actor, tab === "unread");
  return <NoticesView basePath="/supplier/notices" tab={tab} now={new Date()} {...page} />;
}

export default function SupplierNoticesPage({ searchParams }: PageProps<"/supplier/notices">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Notices searchParams={searchParams} />
    </Suspense>
  );
}
