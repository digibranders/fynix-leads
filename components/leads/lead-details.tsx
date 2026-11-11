import { ListMagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Lead } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { ContactTile, MeetingTile, QualificationTiles } from "./lead-tiles";

type Props = {
  lead: Lead;
  viewerZone: string;
  now: Date;
  className?: string;
};

/**
 * The tonal detail pane: lifted white tiles for meeting, contact and the four qualification answers.
 * One column from `lg` (the left pane), two columns from `md` below that, one column on a phone.
 */
export function LeadDetails({ lead, viewerZone, now, className }: Props) {
  return (
    <aside aria-label="Lead details" className={cn("rounded-lg bg-tonal p-3", className)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
        <MeetingTile lead={lead} viewerZone={viewerZone} now={now} tone="on-tonal" headingLevel={2} />
        <ContactTile lead={lead} viewerZone={viewerZone} now={now} tone="on-tonal" headingLevel={2} />
        <h2 className="flex items-center gap-2 px-2 pt-3.5 text-[13px] font-semibold text-ink-2 md:col-span-2 lg:col-span-1">
          <ListMagnifyingGlass aria-hidden size={17} />
          Qualification
        </h2>
        <QualificationTiles lead={lead} tone="on-tonal" headingLevel={2} className="md:col-span-2 md:grid-cols-2 lg:col-span-1 lg:grid-cols-1" />
      </div>
    </aside>
  );
}
