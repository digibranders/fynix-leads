import type { Metadata } from "next";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { MeetingsTable } from "@/components/tenant/meetings-table";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listClientMeetings } from "@/server/domain/meetings";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Campaign Meetings" };

export default async function ClientMeetingsPage() {
  const view = await requireClient();
  const db = getDatabase("leads_client").db;
  const meetings = await listClientMeetings(db, view.actor);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Campaign Meetings"
        subtitle="Scheduled discovery calls and meetings with qualified prospects."
      />

      {meetings.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={CalendarBlank} title="No meetings scheduled yet">
            Meetings confirmed from qualified leads will appear here with calendar downloads and Google Meet links.
          </EmptyState>
        </div>
      ) : (
        <MeetingsTable meetings={meetings} canWrite={view.canWrite} now={now} />
      )}
    </div>
  );
}
