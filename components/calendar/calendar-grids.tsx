import Link from "next/link";
import { dayLabel, minutesIntoDay, monthGrid } from "@/lib/calendar/view";
import { GRID_END_MINUTE, GRID_START_MINUTE, bookedRuns, meetingsOnDay, type CalendarPersonLike, type Run } from "@/lib/calendar/layout";
import { cn } from "@/lib/utils";

/** A meeting as a block needs it. The screens pass `CalendarMeeting` from the domain, which has more. */
export interface GridMeeting {
  readonly id: string;
  readonly start: string;
  readonly minutes: number;
  readonly company: string;
  readonly status: string;
}

const SPAN = GRID_END_MINUTE - GRID_START_MINUTE;
const HOURS = Array.from({ length: (GRID_END_MINUTE - GRID_START_MINUTE) / 60 + 1 }, (_, index) => GRID_START_MINUTE + index * 60);
/** The label of every hour but the last line, which is the same midnight as the first. */
const HOUR_LABELS = HOURS.slice(0, -1);
const HATCH = "repeating-linear-gradient(135deg, transparent 0, transparent 6px, rgb(12 30 46 / 0.07) 6px, rgb(12 30 46 / 0.07) 12px)";

const percent = (minute: number): number => ((minute - GRID_START_MINUTE) / SPAN) * 100;
export const clock = (minute: number): string => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The word on a block of time. Short blocks keep the word for a screen reader, so a status is never colour alone and never clipped. */
function Word({ text, long }: { readonly text: string; readonly long: boolean }) {
  return <span className={cn("block truncate px-2 pt-1 text-caption font-semibold", !long && "sr-only")}>{text}</span>;
}

function RunBlock({ run }: { readonly run: Run }) {
  return (
    <div
      className="absolute inset-x-0.5 overflow-hidden rounded-xs bg-navy-07 text-ink-2"
      style={{ top: `${percent(run.fromMinute)}%`, height: `${((run.toMinute - run.fromMinute) / SPAN) * 100}%`, backgroundImage: HATCH }}
    >
      <Word text="Booked" long={run.toMinute - run.fromMinute >= 60} />
    </div>
  );
}

function HourLabels() {
  return (
    <div className="relative h-full" aria-hidden="true">
      {HOUR_LABELS.map((minute) => (
        <span key={minute} className="absolute right-2 -translate-y-1/2 text-caption text-ink-muted" style={{ top: `${percent(minute)}%` }}>
          {clock(minute)}
        </span>
      ))}
    </div>
  );
}

function Lines() {
  return (
    <>
      {HOURS.slice(1, -1).map((minute) => (
        <div key={minute} aria-hidden="true" className="absolute inset-x-0 h-px bg-line" style={{ top: `${percent(minute)}%` }} />
      ))}
    </>
  );
}

// 40 pixels an hour, so a whole day is 960.
const LANE_HEIGHT = "h-[960px]";

/** One day, a lane for each person of the client with only the time that is booked, in the viewer's own zone. */
export function DayGrid({ people, dayKey, zone }: { readonly people: readonly CalendarPersonLike[]; readonly dayKey: string; readonly zone: string }) {
  return (
    <div className="overflow-x-auto px-3 pb-4">
      <div className="grid min-w-[420px] gap-x-1" style={{ gridTemplateColumns: `52px repeat(${people.length}, minmax(112px, 1fr))` }}>
        <div />
        {people.map((person) => (
          <div key={person.memberId} className="truncate px-2 pb-2 text-row font-semibold">
            {person.displayName}
          </div>
        ))}
        <div className={cn("relative", LANE_HEIGHT)}>
          <HourLabels />
        </div>
        {people.map((person) => (
          <div key={person.memberId} role="group" aria-label={`${person.displayName}, ${dayKey}`} className={cn("relative rounded-sm bg-surface shadow-[inset_0_0_0_1px_var(--line)]", LANE_HEIGHT)}>
            <Lines />
            {bookedRuns(person, dayKey, zone).map((run) => (
              <RunBlock key={run.fromMinute} run={run} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingBlock({ meeting, zone }: { readonly meeting: GridMeeting; readonly zone: string }) {
  const start = Math.min(Math.max(minutesIntoDay(new Date(meeting.start), zone), GRID_START_MINUTE), GRID_END_MINUTE - 30);
  return (
    <div
      className="absolute inset-x-1 z-10 overflow-hidden rounded-xs bg-blue-soft px-2 py-1 text-caption font-semibold text-blue-text shadow-[inset_3px_0_0_var(--color-blue-solid)]"
      style={{ top: `${percent(start)}%`, height: `${(Math.max(meeting.minutes, 30) / SPAN) * 100}%` }}
    >
      <span className="block truncate">
        {clock(start)} {meeting.company}
      </span>
      <span className="block truncate font-normal">Scheduled</span>
    </div>
  );
}

/** One week: a column for each day with its meetings. A day opens its own view. */
export function WeekGrid({
  days,
  meetings,
  zone,
  todayKey,
  dayHref,
}: {
  readonly days: readonly string[];
  readonly meetings: readonly GridMeeting[];
  readonly zone: string;
  readonly todayKey: string;
  readonly dayHref: (dayKey: string) => string;
}) {
  return (
    <div className="overflow-x-auto px-3 pb-4">
      <div className="grid min-w-[640px] gap-x-1" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
        <div />
        {days.map((day) => (
          <Link key={day} href={dayHref(day)} className={cn("mx-0.5 mb-2 rounded-sm px-2 py-1.5 text-center text-row font-semibold hover:bg-navy-07", day === todayKey && "bg-navy text-offwhite hover:bg-navy")}>
            {dayLabel(day)}
          </Link>
        ))}
        <div className={cn("relative", LANE_HEIGHT)}>
          <HourLabels />
        </div>
        {days.map((day) => (
          <div key={day} role="group" aria-label={day} className={cn("relative rounded-sm bg-surface shadow-[inset_0_0_0_1px_var(--line)]", LANE_HEIGHT)}>
            <Lines />
            {meetingsOnDay(meetings, day, zone).map((meeting) => (
              <MeetingBlock key={meeting.id} meeting={meeting} zone={zone} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One month: each day with its meetings. A day opens its own view. */
export function MonthGrid({
  dateKey,
  meetings,
  zone,
  todayKey,
  dayHref,
}: {
  readonly dateKey: string;
  readonly meetings: readonly GridMeeting[];
  readonly zone: string;
  readonly todayKey: string;
  readonly dayHref: (dayKey: string) => string;
}) {
  const weeks = monthGrid(dateKey);
  return (
    <div className="overflow-x-auto px-3 pb-4">
      <div className="grid min-w-[560px] grid-cols-7 gap-0.5">
        {weeks[0]?.map((cell) => (
          <div key={cell.key} className="px-2 py-1.5 text-label font-semibold text-ink-muted">
            {dayLabel(cell.key).split(" ")[0]}
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const own = meetingsOnDay(meetings, cell.key, zone);
          return (
            <Link key={cell.key} href={dayHref(cell.key)} className={cn("flex min-h-24 min-w-0 flex-col gap-1 rounded-sm bg-navy-03 p-1.5 hover:bg-navy-07", !cell.inMonth && "opacity-50")}>
              <span className={cn("self-start rounded-xs px-1.5 text-label font-semibold", cell.key === todayKey ? "bg-navy text-offwhite" : "text-ink-2")}>{Number(cell.key.slice(8))}</span>
              {own.slice(0, 2).map((meeting) => (
                <span key={meeting.id} className="block truncate rounded-xs bg-blue-soft px-1.5 text-caption font-semibold text-blue-text">
                  {clock(minutesIntoDay(new Date(meeting.start), zone))} {meeting.company}
                </span>
              ))}
              {own.length > 2 ? <span className="px-1.5 text-caption font-semibold text-ink-muted">{own.length - 2} more</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
