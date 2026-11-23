import type { Metadata } from "next";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { MeetingsTable } from "@/components/tenant/meetings-table";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listAgencyMeetings } from "@/server/domain/meetings";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Supplier Meetings" };

export default async function SupplierMeetingsPage() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const meetings = await listAgencyMeetings(db, view.actor);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader
        title="Campaign Meetings"
        subtitle="Meetings across your partner agencies and campaigns."
      />

      {meetings.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 shadow-raised">
          <EmptyState icon={CalendarBlank} title="No meetings scheduled yet">
            Meetings booked for partner agency campaigns will appear here.
          </EmptyState>
        </div>
      ) : (
        <MeetingsTable meetings={meetings} canWrite={view.canWrite} now={now} showBrand />
      )}
    </div>
  );
}
