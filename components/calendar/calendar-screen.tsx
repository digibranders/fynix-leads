"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { DayGrid, MonthGrid, WeekGrid } from "@/components/calendar/calendar-grids";
import { EmptyState } from "@/components/kit/empty-state";
import { NATIVE_FIELD } from "@/components/kit/field-classes";
import { Panel } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { When, useViewerZone } from "@/components/kit/when";
import { meetingsOnDay } from "@/lib/calendar/layout";
import { CALENDAR_VIEWS, calendarHref, dayKeyIn, shiftQuery, titleFor, visibleDays, type CalendarQuery, type CalendarView } from "@/lib/calendar/view";
import { cn } from "@/lib/utils";
import type { CalendarData, CalendarMeeting } from "@/server/domain/calendar-data";

const VIEW_LABEL: Record<CalendarView, string> = { month: "Month", week: "Week", day: "Day" };
const MEETING_STATUSES = ["scheduled", "held", "client_no_show", "prospect_no_show", "rescheduled", "cancelled"] as const;
type MeetingStatus = (typeof MEETING_STATUSES)[number];
const isMeetingStatus = (value: string): value is MeetingStatus => (MEETING_STATUSES as readonly string[]).includes(value);

const button = "inline-flex h-8 items-center justify-center rounded-sm px-3 text-body font-semibold transition-colors max-md:h-10";

function Legend({ view }: { readonly view: CalendarView }) {
  const items =
    view === "day"
      ? [
          ["bg-green-soft", "Free"],
          ["bg-navy-07", "Busy"],
          ["bg-navy-03", "Too soon to book"],
          ["bg-navy-04", "Not working"],
        ]
      : view === "week"
        ? [
            ["bg-green-soft", "How many people are free"],
            ["bg-blue-soft", "Meeting"],
          ]
        : [
            ["bg-blue-soft", "Meeting"],
            ["bg-green-soft", "Free times left"],
          ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3 text-label text-ink-muted" aria-label="What the colours mean">
      {items.map(([swatch, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-3 rounded-xs shadow-[inset_0_0_0_1px_var(--line)]", swatch)} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function MeetingList({ meetings }: { readonly meetings: readonly CalendarMeeting[] }) {
  return (
    <Panel aria-label="Meetings in view">
      <h2 className="px-5 pt-4 pb-2 text-section font-semibold">Meetings in view</h2>
      {meetings.length === 0 ? (
        <p className="px-5 pb-5 text-body text-ink-muted">No meetings on these days.</p>
      ) : (
        <ul className="flex flex-col pb-2">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none">
              <span className="min-w-0">
                <span className="block text-row font-semibold">{meeting.company}</span>
                <span className="block text-table text-ink-muted">
                  <When at={meeting.start} />
                  {meeting.with === null ? "" : `, with ${meeting.with}`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {isMeetingStatus(meeting.status) ? <StatusChip kind="meeting" status={meeting.status} size="sm" /> : meeting.status === "awaiting_reply" ? <StatusChip kind="lead" status="awaiting_reply" size="sm" /> : null}
                {meeting.link === null ? (
                  <span className="text-table text-ink-muted">Link to follow</span>
                ) : (
                  <a href={meeting.link} target="_blank" rel="noopener noreferrer" className={cn(button, "bg-navy-07 text-ink hover:bg-navy-10")}>
                    Meeting link
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The calendar of a role: the people of one client, when each is free or busy, and the meetings the viewer may read. Month, week and day, the client chosen
 * where there is a choice. All of it is in the address, so a link opens the same view. Laid out in the viewer's own time zone.
 */
export function CalendarScreen({ data, query, basePath, now }: { readonly data: CalendarData; readonly query: CalendarQuery; readonly basePath: string; readonly now: string }) {
  const router = useRouter();
  const zone = useViewerZone();
  const nowDate = new Date(now);
  const todayKey = dayKeyIn(nowDate, zone);
  const team = data.selected;
  const agency = data.agency ?? null;
  const href = (next: CalendarQuery) => calendarHref(basePath, next, team, agency);
  const dayHref = (dayKey: string) => href({ view: "day", date: dayKey });
  const days = visibleDays(query);
  const inView = days.flatMap((day) => meetingsOnDay(data.meetings, day, zone));
  const shown = query.view === "month" ? inView.filter((meeting) => dayKeyIn(new Date(meeting.start), zone).slice(0, 7) === query.date.slice(0, 7)) : inView;

  if (data.selected === null) {
    return (
      <Panel>
        <EmptyState icon={CalendarBlank} title="No clients to show yet">
          A calendar appears here once you have a campaign.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel aria-label="Calendar">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 pb-3">
          {data.choices.length > 1 ? (
            <label className="flex items-center gap-2 text-label font-semibold text-ink-2">
              Client
              <select className={cn(NATIVE_FIELD, "w-auto min-w-40")} value={data.selected} onChange={(event) => router.push(calendarHref(basePath, query, event.target.value, agency))}>
                {data.choices.map((choice) => (
                  <option key={choice.campaignId} value={choice.campaignId}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {data.agencies !== undefined && data.agencies.length > 1 ? (
            <label className="flex items-center gap-2 text-label font-semibold text-ink-2">
              Agency
              <select className={cn(NATIVE_FIELD, "w-auto min-w-40")} value={agency ?? ""} onChange={(event) => router.push(calendarHref(basePath, query, team, event.target.value === "" ? null : event.target.value))}>
                <option value="">All agencies</option>
                {data.agencies.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <nav aria-label="View" className="inline-flex rounded-sm bg-navy-05 p-0.5">
            {CALENDAR_VIEWS.map((view) => (
              <Link key={view} href={href({ view, date: query.date })} aria-current={view === query.view ? "page" : undefined} className={cn(button, view === query.view ? "bg-navy text-offwhite" : "text-ink-2 hover:text-ink")}>
                {VIEW_LABEL[view]}
              </Link>
            ))}
          </nav>
          <nav aria-label="Move" className="flex items-center gap-1.5">
            <Link href={href(shiftQuery(query, -1))} className={cn(button, "bg-navy-07 text-ink hover:bg-navy-10")}>
              Previous
            </Link>
            <Link href={href({ view: query.view, date: todayKey })} className={cn(button, "bg-navy-07 text-ink hover:bg-navy-10")}>
              Today
            </Link>
            <Link href={href(shiftQuery(query, 1))} className={cn(button, "bg-navy-07 text-ink hover:bg-navy-10")}>
              Next
            </Link>
          </nav>
        </div>
        <h2 className="px-5 text-section font-semibold">{titleFor(query)}</h2>
        <p className="px-5 pb-2 text-label text-ink-muted">Times are in your time zone, {zone}.</p>
        <Legend view={query.view} />
        {data.people.length === 0 ? (
          <EmptyState icon={CalendarBlank} title="No team members yet">
            This client has nobody on its team to show.
          </EmptyState>
        ) : query.view === "day" ? (
          <DayGrid people={data.people} dayKey={query.date} zone={zone} now={nowDate} />
        ) : query.view === "week" ? (
          <WeekGrid people={data.people} days={days} meetings={data.meetings} zone={zone} now={nowDate} todayKey={todayKey} dayHref={dayHref} />
        ) : (
          <MonthGrid people={data.people} dateKey={query.date} meetings={data.meetings} zone={zone} now={nowDate} todayKey={todayKey} dayHref={dayHref} />
        )}
      </Panel>
      <MeetingList meetings={shown} />
    </div>
  );
}
