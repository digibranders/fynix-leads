"use client";

import { Check } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { When } from "@/components/kit/when";
import { Choice } from "@/components/ui/choice";
import { DateField } from "@/components/ui/date-time";
import { earliestBookable, freePeopleAt } from "@/lib/calendar/free-time";
import { personTime, type CalendarPersonLike } from "@/lib/calendar/layout";
import { dayKeyIn, slotInstants } from "@/lib/calendar/view";
import { formatTimeInZone, zoneAbbreviation } from "@/lib/time/zones";

/** How long a booked meeting lasts, held equal to the server's by the booking itself, which checks every invited person again. */
const MEETING_MINUTES = 30;
const STEP_MINUTES = 30;

/** The first day that can hold a meeting, in the client's zone: today is not it, because a booking needs 48 hours' notice. */
export function firstPickableDay(now: Date, zone: string): string {
  return dayKeyIn(earliestBookable(now), zone);
}

/**
 * The meeting time of the lead form: one time when someone from the client team is free, and the people to invite to it. Times are read in the client's zone with
 * the same moment in the viewer's zone under the choice. Everyone free then starts ticked and can be unticked, but at least one stays. A busy person is named as
 * busy and cannot be invited. The form posts `proposedTimes` (the one time), `hostMemberId` (the first person ticked) and `inviteeMemberIds` (everyone ticked).
 */
export function SlotPicker({ people, initialTime = null, onChange }: { readonly people: readonly CalendarPersonLike[]; readonly initialTime?: string | null; readonly onChange?: (slot: { readonly time: string; readonly invitees: number }) => void }) {
  const zone = people[0]?.timeZone ?? null;
  const [now] = useState(() => new Date());
  const [day, setDay] = useState(() => (initialTime !== null && zone !== null ? dayKeyIn(new Date(initialTime), zone) : ""));
  const [iso, setIso] = useState(initialTime ?? "");
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const times = useMemo(() => people.map((person) => ({ memberId: person.memberId, ...personTime(person) })), [people]);
  const freeAt = (start: Date): string[] => freePeopleAt({ start, end: new Date(start.getTime() + MEETING_MINUTES * 60_000) }, times, now);

  const options = useMemo(() => {
    if (zone === null || day === "") return [];
    return slotInstants(day, zone, 0, 24 * 60, STEP_MINUTES).filter((start) => freePeopleAt({ start, end: new Date(start.getTime() + MEETING_MINUTES * 60_000) }, times, now).length > 0);
  }, [day, zone, times, now]);

  const chosen = iso === "" ? null : new Date(iso);
  const free = chosen === null ? [] : freeAt(chosen);
  const invited = people.filter((person) => free.includes(person.memberId) && !unticked.has(person.memberId));
  const toggle = (memberId: string, on: boolean) => setUnticked((current) => new Set(on ? [...current].filter((id) => id !== memberId) : [...current, memberId]));

  // The form around the picker learns what is chosen, so it can keep its send button off until a time and someone to invite are picked.
  const inviteCount = invited.length;
  useEffect(() => onChange?.({ time: iso, invitees: inviteCount }), [onChange, iso, inviteCount]);

  if (zone === null) return <p className="text-label text-ink-muted">This client has no team members to invite yet, so there are no times to offer.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted">{`Times are in the client's time zone, ${zone}. Only times when someone is free are listed, at least 48 hours ahead.`}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[210px]">
          <DateField
            value={day}
            min={firstPickableDay(now, zone)}
            onChange={(next) => {
              setDay(next);
              setIso("");
              setUnticked(new Set());
            }}
            aria-label="Day of the meeting"
            placeholder="Pick a day"
          />
        </div>
        <div className="w-full sm:w-[210px]">
          <Choice
            key={day}
            value={iso}
            onValueChange={(next) => {
              setIso(next);
              setUnticked(new Set());
            }}
            placeholder="Pick a start"
            emptyLabel={day === "" ? "Pick a day first" : "Nobody is free that day"}
            options={options.map((start) => ({ value: start.toISOString(), label: `${formatTimeInZone(start, zone)} ${zoneAbbreviation(start, zone)}` }))}
            aria-label="Start of the meeting"
          />
        </div>
        {chosen === null ? null : (
          <span className="text-body text-ink-2">
            That is <When at={chosen} />
          </span>
        )}
      </div>

      {chosen === null ? null : free.length === 0 ? (
        <p role="status" className="text-label text-red-text">
          Nobody is free then. Pick another time.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-0.5 rounded-md bg-surface px-3.5 py-3">
          <legend className="sr-only">Who to invite</legend>
          <p className="text-row font-semibold">Who to invite</p>
          <p className="text-caption text-ink-muted">The first person to accept takes the meeting. The others are let go.</p>
          {people.map((person) => {
            const isFree = free.includes(person.memberId);
            const checked = isFree && !unticked.has(person.memberId);
            const onlyOne = checked && invited.length === 1;
            return (
              <label key={person.memberId} className={`relative flex min-h-11 items-center gap-3 text-body font-medium ${isFree ? "cursor-pointer" : "text-ink-muted"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!isFree || onlyOne}
                  onChange={(event) => toggle(person.memberId, event.target.checked)}
                  className="peer absolute size-[22px] opacity-0"
                />
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-xs bg-surface text-offwhite shadow-[inset_0_0_0_1.5px_var(--ctl-edge)] peer-checked:bg-navy peer-checked:shadow-none peer-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--navy)]"
                >
                  <Check weight="bold" size={14} className={checked ? "opacity-100" : "opacity-0"} />
                </span>
                {person.displayName}
                {isFree ? null : <span className="text-label font-normal text-ink-muted">Busy then</span>}
              </label>
            );
          })}
        </fieldset>
      )}

      <input type="hidden" name="proposedTimes" value={iso} />
      <input type="hidden" name="hostMemberId" value={invited[0]?.memberId ?? ""} />
      {invited.map((person) => (
        <input key={person.memberId} type="hidden" name="inviteeMemberIds" value={person.memberId} />
      ))}
    </div>
  );
}
