import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { MEETING_SHOWS, PortalMeetings, meetingsSummary } from "@/components/meetings/portal-meetings";
import { parsePage } from "@/lib/leads/list";
import { getDatabase } from "@/server/db/client";
import { listFynixMeetings } from "@/server/domain/meetings";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Meetings" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Meetings({ searchParams }: { searchParams: PageProps<"/fynix/meetings">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const meetings = await listFynixMeetings(getDatabase("leads_fynix").db, view.actor);
  const now = new Date();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Meetings" description={meetingsSummary(meetings, now, "Every meeting across all campaigns appears here once a client accepts a time.")} />
      <PortalMeetings
        meetings={meetings}
        basePath="/fynix/meetings"
        show={MEETING_SHOWS.find((entry) => entry.key === one(params.show))?.key ?? null}
        q={one(params.q) ?? ""}
        page={parsePage(params.page)}
        // Fynix watches meetings; the client records the outcome.
        canWrite={false}
        now={now}
        emptyText="Meetings appear here once a client accepts a time."
      />
    </div>
  );
}

export default function FynixMeetingsPage({ searchParams }: PageProps<"/fynix/meetings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings searchParams={searchParams} />
    </Suspense>
  );
}
