import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { NoticesView, parseNoticesTab } from "@/components/notices/notices-view";
import { getDatabase } from "@/server/db/client";
import { loadNoticesPage } from "@/server/domain/notice-page";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Notices" };

async function Notices({ searchParams }: { searchParams: PageProps<"/fynix/notices">["searchParams"] }) {
  const view = await requireFynix();
  const tab = parseNoticesTab((await searchParams).show);
  const actor = { userId: view.actor.userId, orgKind: "fynix", role: view.canWrite ? "manager" : "member", displayName: view.name } as const;
  const page = await loadNoticesPage(getDatabase("leads_fynix").db, actor, tab === "unread");
  return <NoticesView basePath="/fynix/notices" tab={tab} now={new Date()} {...page} />;
}

export default function FynixNoticesPage({ searchParams }: PageProps<"/fynix/notices">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Notices searchParams={searchParams} />
    </Suspense>
  );
}
