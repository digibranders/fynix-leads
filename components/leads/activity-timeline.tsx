"use client";

import { useId, useMemo, useState } from "react";
import {
  CalendarBlank,
  CaretDown,
  CaretRight,
  Check,
  ChatCircleDots,
  PaperPlaneTilt,
  X,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ActivityEvent } from "@/lib/domain/types";
import { dayHeading, groupActivity } from "@/lib/leads/activity";
import { activityIcon, type ActivityGlyph, type ActivityTone } from "@/lib/leads/activity-icons";
import { formatTimeInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

type Props = { events: ActivityEvent[]; now: Date; viewerZone: string };

const GLYPH: Record<Exclude<ActivityGlyph, "system">, Icon> = {
  chat: ChatCircleDots,
  "paper-plane": PaperPlaneTilt,
  calendar: CalendarBlank,
  check: Check,
  cross: X,
};

const DISC: Record<ActivityTone, string> = {
  peach: "bg-peach/32 text-peach-deep",
  navy: "bg-navy-07 text-ink-2",
};

/**
 * One row. Wide panels (from 34rem) lay it out on one line: time, disc, text, actor on the right.
 * Narrow panels put the actor under the text, and the day label above the group.
 */
const ROW = "grid grid-cols-[4rem_28px_minmax(0,1fr)] items-center gap-x-3 @[34rem]:grid-cols-[4rem_28px_minmax(0,1fr)_auto] @[34rem]:gap-x-3.5";

function Time({ event, viewerZone, className }: { event: ActivityEvent; viewerZone: string; className?: string }) {
  return (
    <time dateTime={event.at} className={cn("font-mono text-[12.5px] font-medium text-ink-muted tabular-nums", className)}>
      {formatTimeInZone(new Date(event.at), viewerZone)}
    </time>
  );
}

function Disc({ event }: { event: ActivityEvent }) {
  const { glyph, tone } = activityIcon(event);
  if (glyph === "system") return <span aria-hidden />;
  const Glyph = GLYPH[glyph];
  return (
    <span aria-hidden className={cn("grid size-7 place-items-center rounded-full", DISC[tone])}>
      <Glyph size={15} weight={glyph === "chat" || glyph === "paper-plane" ? "fill" : "bold"} />
    </span>
  );
}

function HumanRow({ event, viewerZone }: { event: ActivityEvent; viewerZone: string }) {
  return (
    <li className={cn(ROW, "min-h-10 py-1.5 @[34rem]:py-0")}>
      <Time event={event} viewerZone={viewerZone} className="text-right" />
      <Disc event={event} />
      <p className="min-w-0 text-body font-medium text-pretty break-words">{event.text}</p>
      <p className="col-start-3 text-[13px] text-ink-muted @[34rem]:col-start-4 @[34rem]:justify-self-end">{event.actor}</p>
    </li>
  );
}

function SystemLine({ event, viewerZone, className }: { event: ActivityEvent; viewerZone: string; className: string }) {
  return (
    <li className={cn(ROW, className)}>
      <Time event={event} viewerZone={viewerZone} className="text-right" />
      <span aria-hidden />
      <p className="min-w-0 text-[13px] text-ink-muted break-words">{event.text}</p>
    </li>
  );
}

function SystemRun({ events, viewerZone }: { events: ActivityEvent[]; viewerZone: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (events.length === 1) return <SystemLine event={events[0]} viewerZone={viewerZone} className="min-h-10" />;

  const Caret = open ? CaretDown : CaretRight;
  return (
    <li className="flex flex-col">
      <div className={cn(ROW, "min-h-10")}>
        <Time event={events[0]} viewerZone={viewerZone} className="text-right" />
        <span aria-hidden />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-[26px] w-fit items-center gap-1.5 rounded-full bg-navy-05 pr-3 pl-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-navy-07 max-lg:h-9 max-md:h-10 max-lg:pr-3.5"
        >
          <Caret aria-hidden size={13} />
          {events.length} system updates
        </button>
      </div>
      <ul id={panelId} hidden={!open} className="flex flex-col pb-1">
        {events.map((e) => (
          <SystemLine key={e.id} event={e} viewerZone={viewerZone} className="min-h-8" />
        ))}
      </ul>
    </li>
  );
}

export function ActivityTimeline({ events, now, viewerZone }: Props) {
  const groups = useMemo(() => groupActivity(events, viewerZone), [events, viewerZone]);

  if (groups.length === 0) {
    return <p className="px-6 pb-5 text-sm text-ink-muted">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5 pb-2.5">
      {groups.map((group) => {
        const { title, sub } = dayHeading(group.at, now, viewerZone);
        return (
          <section
            key={group.key}
            aria-label={title === "Today" ? `Today, ${sub}` : title}
            className="grid px-6 @[34rem]:grid-cols-[96px_minmax(0,1fr)]"
          >
            <h3 className="pt-2.5 text-[13px] leading-5 font-semibold text-ink-2">
              {title}
              {sub && <small className="ml-2 text-xs font-normal text-ink-muted @[34rem]:ml-0 @[34rem]:block">{sub}</small>}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((item) =>
                item.kind === "system" ? (
                  <SystemRun key={item.events[0].id} events={item.events} viewerZone={viewerZone} />
                ) : (
                  <HumanRow key={item.event.id} event={item.event} viewerZone={viewerZone} />
                ),
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
