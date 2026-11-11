import { ListMagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Lead } from "@/lib/domain/types";
import { ContactTile, MeetingTile, QualificationTiles } from "./lead-tiles";

type Props = {
  lead: Lead;
  viewerZone: string;
  now: Date;
};

/** Meeting, contact and qualification tiles for the lead record. The review queue lays the same tiles out itself. */
export function LeadDetails({ lead, viewerZone, now }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <MeetingTile lead={lead} viewerZone={viewerZone} now={now} />
      <ContactTile lead={lead} viewerZone={viewerZone} now={now} />
      <h3 className="mt-3 flex items-center gap-[9px] text-[15px] font-semibold">
        <ListMagnifyingGlass aria-hidden size={19} className="text-ink-2" />
        Qualification
      </h3>
      <QualificationTiles lead={lead} className="sm:grid-cols-2" />
    </div>
  );
}
