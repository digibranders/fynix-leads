"use client";

import { useId, useMemo, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ActivityEvent } from "@/lib/domain/types";
import { groupActivity } from "@/lib/leads/activity";
import { formatTimeInZone } from "@/lib/time/zones";

type Props = { events: ActivityEvent[]; viewerZone: string };

const ROW = "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3";

function EventTime({ event, viewerZone }: { event: ActivityEvent; viewerZone: string }) {
  const at = new Date(event.at);
  return (
    <time dateTime={event.at} className="pt-px text-xs text-muted-foreground">
      {formatTimeInZone(at, viewerZone)}
    </time>
  );
}

function SystemRun({ events, viewerZone }: { events: ActivityEvent[]; viewerZone: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (events.length === 1) {
    const [only] = events;
    return (
      <li className={`${ROW} py-1`}>
        <EventTime event={only} viewerZone={viewerZone} />
        <p className="text-xs text-muted-foreground">{only.text}</p>
      </li>
    );
  }

  const Caret = open ? CaretDown : CaretRight;
  return (
    <li className="flex flex-col gap-1 py-1">
      {/* 5.25rem is the time column (4.5rem) plus its gap, so the toggle lines up with event text. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="ml-[calc(5.25rem-0.25rem)] flex min-h-6 w-fit items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Caret aria-hidden size={12} />
        {events.length} system updates
      </button>
      {open && (
        <ul id={panelId} className="flex flex-col gap-1 pb-1">
          {events.map((e) => (
            <li key={e.id} className={ROW}>
              <EventTime event={e} viewerZone={viewerZone} />
              <span className="text-xs text-muted-foreground">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ActivityTimeline({ events, viewerZone }: Props) {
  const groups = useMemo(() => groupActivity(events, viewerZone), [events, viewerZone]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-1">
          <h3 className="border-b pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</h3>
          <ul className="flex flex-col">
            {group.items.map((item) =>
              item.kind === "system" ? (
                <SystemRun key={item.events[0].id} events={item.events} viewerZone={viewerZone} />
              ) : (
                <li key={item.event.id} className={`${ROW} py-1.5`}>
                  <EventTime event={item.event} viewerZone={viewerZone} />
                  <div className="flex min-w-0 flex-col">
                    <p className="text-sm break-words text-pretty">{item.event.text}</p>
                    <p className="text-xs text-muted-foreground">{item.event.actor}</p>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
