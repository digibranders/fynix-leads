"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Notice } from "@/components/auth/notice";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { DateField, DateTimeField } from "@/components/ui/date-time";
import { describeHostHours } from "@/lib/leads/host-hours-text";
import { proposedTimeWarnings, quarterHourSlotsForHost, type HostAvailability } from "@/lib/leads/host-hours";
import { formatInZone, formatTimeInZone, zoneAbbreviation } from "@/lib/time/zones";

/** One proposed time: `slots` picks from the host's free quarter hours, `free` takes any time (and so can warn), `saved` is a time a draft already holds. */
interface Slot {
  readonly mode: "slots" | "free" | "saved";
  /** "YYYY-MM-DD" in the host's zone, in `slots` mode. */
  readonly day: string;
  /** The ISO instant that is posted. Empty until a time is chosen. */
  readonly iso: string;
  /** The local date and time text of the free picker. */
  readonly free: string;
}

const empty = (): Slot => ({ mode: "slots", day: "", iso: "", free: "" });

/** Today as "YYYY-MM-DD" on this device: a meeting cannot be proposed for a day that has gone. */
function earliestDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * The proposed times of the lead form. With a host chosen who has set hours, a time is a day and a start from the host's free quarter hours, shown in the
 * host's zone with the same moment in the viewer's under it. Any other time can still be entered, and then a warning says when it is outside the host's hours or
 * blocked: the warning never stops the lead. The value of every slot is an ISO instant, posted as `proposedTimes`.
 */
export function HostTimesField({ availability, hostName, initialTimes = [] }: { readonly availability: HostAvailability | null; readonly hostName: string | null; readonly initialTimes?: readonly string[] }) {
  const [slots, setSlots] = useState<readonly Slot[]>(initialTimes.length === 0 ? [empty()] : initialTimes.map((iso) => ({ mode: "saved", day: "", iso, free: "" })));
  const zone = availability?.timeZone ?? null;
  const hasHours = availability !== null && zone !== null && availability.hours.length > 0;
  const update = (index: number, next: Partial<Slot>) => setSlots(slots.map((slot, at) => (at === index ? { ...slot, ...next } : slot)));
  const chosen = slots.filter((slot) => slot.iso !== "");
  const warnings = availability === null ? [] : proposedTimeWarnings(chosen.map((slot) => new Date(slot.iso)), availability);

  return (
    <div className="flex flex-col gap-3">
      {availability === null ? (
        <p className="text-label text-ink-muted">Choose a host to see their working hours and pick from their free times.</p>
      ) : hasHours ? (
        <div className="flex flex-col gap-0.5 rounded-md bg-surface px-3.5 py-3">
          <p className="text-row font-semibold">{hostName === null ? "Host hours" : `${hostName}'s hours`}</p>
          {describeHostHours(availability.hours).map((line) => (
            <p key={line} className="text-body text-ink-2">
              {line}
            </p>
          ))}
          <p className="text-caption text-ink-muted">{`Times are in the host's zone, ${zone}. Each shows the same moment in yours.`}</p>
        </div>
      ) : (
        <p className="text-label text-ink-muted">This host has not set working hours yet, so any time can be proposed and none can be checked.</p>
      )}

      {slots.map((slot, index) => {
        const options = hasHours && slot.mode === "slots" && slot.day !== "" ? quarterHourSlotsForHost(slot.day, availability, { notBefore: new Date() }) : [];
        const when = slot.iso === "" ? null : new Date(slot.iso);
        return (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {slot.mode === "saved" ? (
                <>
                  <span className="rounded-md bg-surface px-3.5 py-2.5 text-row font-medium">
                    <When at={slot.iso} />
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => update(index, { mode: "slots", day: "", iso: "" })}>
                    Change
                  </Button>
                </>
              ) : slot.mode === "slots" && hasHours ? (
                <>
                  <div className="w-full sm:w-[210px]">
                    <DateField value={slot.day} min={earliestDay()} onChange={(day) => update(index, { day, iso: "" })} aria-label={`Day for proposed time ${index + 1}`} placeholder="Pick a day" />
                  </div>
                  <div className="w-full sm:w-[210px]">
                    <Choice
                      key={slot.day}
                      value={slot.iso}
                      onValueChange={(iso) => update(index, { iso })}
                      placeholder="Pick a start"
                      emptyLabel={slot.day === "" ? "Pick a day first" : "No free time that day"}
                      options={options.map((time) => ({ value: time.toISOString(), label: `${formatTimeInZone(time, zone)} ${zoneAbbreviation(time, zone)}` }))}
                      aria-label={`Start for proposed time ${index + 1}`}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => update(index, { mode: "free", iso: "", free: "" })}>
                    Another time
                  </Button>
                </>
              ) : (
                <>
                  <DateTimeField
                    value={slot.free}
                    min={earliestDay()}
                    onChange={(free) => update(index, { free, iso: free === "" || Number.isNaN(new Date(free).getTime()) ? "" : new Date(free).toISOString() })}
                    aria-label={`Proposed time ${index + 1}`}
                  />
                  {hasHours ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => update(index, { mode: "slots", day: "", iso: "", free: "" })}>
                      Use the host&apos;s hours
                    </Button>
                  ) : null}
                </>
              )}
              <input type="hidden" name="proposedTimes" value={slot.iso} />
              {slots.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSlots(slots.filter((_, at) => at !== index))} aria-label={`Remove proposed time ${index + 1}`}>
                  <Trash aria-hidden />
                  <span className="max-sm:sr-only">Remove</span>
                </Button>
              ) : null}
            </div>
            {when !== null ? (
              <p className="flex flex-col text-caption text-ink-muted">
                {zone === null ? null : <span>{`Host: ${formatInZone(when, zone)}`}</span>}
                <span>
                  For you: <When at={when} />
                </span>
              </p>
            ) : null}
          </div>
        );
      })}

      {slots.length < 3 ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSlots([...slots, empty()])}>
            <Plus aria-hidden weight="bold" />
            Add another time
          </Button>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul aria-label="Warnings about the proposed times" className="flex flex-col gap-1.5">
          {warnings.map((warning) => (
            <li key={`${warning.code}-${warning.time}`}>
              <Notice tone="amber" compact role="note">
                {warning.time === "" ? warning.message : `${warning.message} ${formatInZone(new Date(warning.time), zone ?? "UTC")}.`} You can still send the lead.
              </Notice>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
