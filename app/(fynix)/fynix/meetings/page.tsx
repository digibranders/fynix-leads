import type { Metadata } from "next";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { MeetingsTable } from "@/components/tenant/meetings-table";
import { getDatabase } from "@/server/db/client";
import { listFynixMeetings } from "@/server/domain/meetings";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Meetings" };

export default async function FynixMeetingsPage() {
  const view = await requireFynix();
  const meetings = await listFynixMeetings(getDatabase("leads_fynix").db, view.actor);

  return (
    <>
      <FynixPageHeader title="Meetings" subtitle="Every meeting across all campaigns, newest first" />
      {meetings.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={CalendarBlank} title="No meetings booked yet">
            Meetings appear here once a client accepts a time.
          </EmptyState>
        </div>
      ) : (
        <MeetingsTable meetings={meetings} canWrite={false} now={new Date()} showBrand />
      )}
    </>
  );
}
