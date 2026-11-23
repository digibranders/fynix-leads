import type { Metadata } from "next";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { StatusChip } from "@/components/fynix/status-chip";
import {
  DownloadIcsButton,
  JoinMeetButton,
  RecordMeetingOutcomeModal,
} from "@/components/tenant/meeting-actions";
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
        <div className="overflow-hidden rounded-lg bg-surface shadow-raised ">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Prospect</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Scheduled Time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Join / Calendar</th>
                <th className="px-4 py-3 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {meetings.map((item) => {
                const meetingDate = new Date(item.scheduledStartTime);
                const hasPassed = meetingDate <= now;
                const isScheduled = item.outcome === "scheduled";

                return (
                  <tr key={item.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-mono font-medium text-xs">
                      {item.publicRef}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{item.prospectName}</p>
                      <p className="text-xs text-ink-2">{item.prospectCompany}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{item.campaignName}</p>
                      <p className="text-xs text-ink-2">{item.leadRef}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      <p className="font-medium text-ink">
                        {meetingDate.toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p>{item.durationMinutes} mins</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        kind="meeting"
                        status={item.outcome as "scheduled" | "held" | "client_no_show" | "prospect_no_show"}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <JoinMeetButton url={item.googleMeetUrl} />
                        <DownloadIcsButton meeting={item} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isScheduled && hasPassed && view.canWrite ? (
                        <RecordMeetingOutcomeModal meetingId={item.id} />
                      ) : isScheduled ? (
                        <span className="text-xs text-ink-muted">Awaiting call</span>
                      ) : (
                        <span className="text-xs font-medium text-ink-2">
                          {item.notes ? item.notes : "Outcome recorded"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
