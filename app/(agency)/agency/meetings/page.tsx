import type { Metadata } from "next";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { MeetingsTable } from "@/components/tenant/meetings-table";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listAgencyMeetings } from "@/server/domain/meetings";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Agency Meetings" };

export default async function AgencyMeetingsPage() {
  const view = await requireAgency();
  const db = getDatabase("leads_agency").db;
  const meetings = await listAgencyMeetings(db, view.actor);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Campaign Meetings"
        subtitle="Track upcoming and held meetings for your qualified prospects."
      />

      {meetings.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={CalendarBlank} title="No meetings scheduled yet">
            Meetings confirmed by clients will appear here with Google Meet links.
          </EmptyState>
        </div>
      ) : (
        <MeetingsTable meetings={meetings} canWrite={view.canWrite} now={now} showBrand />
      )}
    </div>
  );
}
