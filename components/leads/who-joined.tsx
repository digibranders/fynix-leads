import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { stayText } from "@/lib/leads/who-joined";
import type { MeetingJoinRecord } from "@/server/domain/meeting-joins";

/**
 * Who was in the room after the meeting: the name as the room showed it, when they joined and how long they stayed. Never an email. Until the import has read
 * the room there are no rows, and the block says so instead of implying nobody came.
 */
export function WhoJoined({ joins }: { readonly joins: readonly Pick<MeetingJoinRecord, "displayName" | "joinedAt" | "durationSeconds">[] }) {
  return (
    <Panel aria-label="Who joined">
      <PanelHeader title="Who joined" count={joins.length === 0 ? undefined : joins.length} />
      {joins.length === 0 ? (
        <p className="px-5 pb-5 text-body text-ink-muted">Not available yet. It is added some time after the meeting ends.</p>
      ) : (
        <ul className="flex flex-col px-5 pb-3">
          {joins.map((join, index) => (
            <li key={`${join.displayName}-${index}`} className="flex flex-col gap-0.5 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none @sm:flex-row @sm:items-baseline @sm:justify-between @sm:gap-4">
              <span className="min-w-0 text-row font-semibold break-words">{join.displayName}</span>
              <span className="text-label text-ink-muted">
                Joined <When at={join.joinedAt} style="time" />, stayed {stayText(join.durationSeconds).toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
