import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";

export interface OwnEventView {
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
}

/**
 * The signed-in person's own events with their titles, for the range on the calendar page. Read live for this request and shown to this person only; nothing is
 * stored. When a provider did not answer, that is said instead of showing a partial calendar as complete.
 */
export function OwnEventsPanel({ events, problems }: { readonly events: readonly OwnEventView[]; readonly problems: readonly string[] }) {
  return (
    <Panel aria-label="Your own calendar">
      <PanelHeader title="Your own calendar" count={events.length} />
      <div className="flex flex-col gap-1 px-5 pb-4">
        <p className="text-label text-ink-muted">Only you see these, with their titles. Everyone else sees you as busy.</p>
        {problems.length > 0 ? <p role="status" className="text-label font-semibold text-red-text">{`Your ${problems.join(" and ")} calendar did not answer, so some events may be missing.`}</p> : null}
        {events.length === 0 && problems.length === 0 ? <p className="py-2 text-body text-ink-2">Nothing in your calendar in this range.</p> : null}
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={`${event.start}-${event.title}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span className="text-row font-medium">{event.title}</span>
              <span className="text-body text-ink-2">{event.allDay ? <When at={event.start} style="day" /> : <When at={event.start} />}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
