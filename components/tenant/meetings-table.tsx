import { StatusChip } from "@/components/fynix/status-chip";
import { DownloadIcsButton, JoinMeetButton, RecordMeetingOutcomeModal, type MeetingItemData } from "./meeting-actions";

export interface MeetingRow extends MeetingItemData {
  readonly leadRef: string;
  /** The client's brand, shown to suppliers and agencies, who work for several clients. */
  readonly clientBrandName?: string;
}

const HEAD = "px-3.5 py-3 font-semibold";
const CELL = "px-3.5 py-3.5 align-top";

/**
 * The meetings of one portal. Reference sits under the prospect and the call buttons stay on one line, so the table keeps to
 * six columns; below its width it scrolls inside its own card instead of pushing a control out of view.
 */
export function MeetingsTable({ meetings, canWrite, showBrand = false, now }: { readonly meetings: readonly MeetingRow[]; readonly canWrite: boolean; readonly showBrand?: boolean; readonly now: Date }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-raised">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-canvas text-xs tracking-wider text-ink-2 uppercase shadow-[inset_0_-1px_0_var(--line)]">
            <tr>
              <th className={HEAD}>Prospect</th>
              <th className={HEAD}>Campaign</th>
              <th className={HEAD}>When</th>
              <th className={HEAD}>Status</th>
              <th className={HEAD}>Join / calendar</th>
              <th className={`${HEAD} text-right`}>Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {meetings.map((item) => {
              const meetingDate = new Date(item.scheduledStartTime);
              const isScheduled = item.outcome === "scheduled";
              return (
                <tr key={item.id} className="hover:bg-canvas/50">
                  <td className={CELL}>
                    <p className="font-semibold text-ink">{item.prospectName}</p>
                    <p className="text-xs text-ink-2">{item.prospectCompany}</p>
                    <p className="mt-1 font-mono text-caption text-ink-muted">{item.publicRef}</p>
                  </td>
                  <td className={CELL}>
                    <p className="text-ink">{item.campaignName}</p>
                    <p className="text-xs text-ink-2">{showBrand && item.clientBrandName !== undefined ? `${item.clientBrandName}, ` : ""}{item.leadRef}</p>
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-xs text-ink-2`}>
                    <p className="font-medium text-ink">{meetingDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                    <p>{item.durationMinutes} mins</p>
                  </td>
                  <td className={CELL}>
                    <StatusChip kind="meeting" status={item.outcome as "scheduled" | "held" | "client_no_show" | "prospect_no_show"} size="sm" />
                  </td>
                  <td className={CELL}>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <JoinMeetButton url={item.googleMeetUrl} />
                      <DownloadIcsButton meeting={item} />
                    </div>
                  </td>
                  <td className={`${CELL} text-right`}>
                    {isScheduled && meetingDate <= now && canWrite ? (
                      <RecordMeetingOutcomeModal meetingId={item.id} />
                    ) : isScheduled ? (
                      <span className="text-xs text-ink-muted">Awaiting call</span>
                    ) : (
                      <span className="text-xs font-medium text-ink-2">{item.notes ? item.notes : "Outcome recorded"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
