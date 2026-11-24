"use client";

import { Plus, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TimeField } from "@/components/ui/date-time";
import { WEEK_ORDER } from "@/lib/fynix/format";
import { dayField, MAX_RANGES_PER_DAY, rangeField, timeValue } from "@/lib/fynix/hours-form";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import type { FormState } from "@/lib/fynix/form-state";
import { ActionForm, useFormState } from "./action-form";
import { FormGroup, Hidden, TextAreaField, TextField } from "./form-parts";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface Range {
  readonly from: string;
  readonly to: string;
}

function rangesOf(windows: readonly HoursWindow[], weekday: number): Range[] {
  return windows.filter((slot) => slot.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute).map((slot) => ({ from: timeValue(slot.startMinute), to: timeValue(slot.endMinute) }));
}

/** One day: its ranges as pairs of time boxes, a way to add another range and to clear one. A day with none is a day off. */
function DayRow({ weekday, initial, error }: { weekday: number; initial: readonly Range[]; error: string | undefined }) {
  const [ranges, setRanges] = useState<Range[]>(initial.length === 0 ? [] : [...initial]);
  const id = useId();
  const change = (index: number, edge: "from" | "to", value: string) => setRanges((current) => current.map((range, at) => (at === index ? { ...range, [edge]: value } : range)));

  return (
    <div className="flex flex-col gap-2 py-3 shadow-[inset_0_-1px_0_var(--line)] first:pt-0 last:pb-0 last:shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-day`} className="text-body font-semibold">
          {DAY_LONG[weekday]}
        </span>
        {ranges.length === 0 ? <span className="text-table text-ink-muted">Not available</span> : null}
        {ranges.length < MAX_RANGES_PER_DAY && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`${ranges.length === 0 ? "Add hours" : "Add a range"} on ${DAY_LONG[weekday]}`}
            onClick={() => setRanges((current) => [...current, { from: current.length === 0 ? "09:00" : "", to: current.length === 0 ? "17:00" : "" }])}
          >
            <Plus aria-hidden />
            {ranges.length === 0 ? "Add hours" : "Add a range"}
          </Button>
        )}
      </div>
      {ranges.map((range, index) => (
        <div key={index} className="flex items-center gap-2">
          <TimeField name={rangeField(weekday, index, "from")} value={range.from} onChange={(next) => change(index, "from", next)} aria-label={`${DAY_LONG[weekday]}, range ${index + 1}, from`} invalid={error !== undefined} />
          <span className="text-table text-ink-muted">to</span>
          <TimeField name={rangeField(weekday, index, "to")} value={range.to} onChange={(next) => change(index, "to", next)} aria-label={`${DAY_LONG[weekday]}, range ${index + 1}, to`} invalid={error !== undefined} />
          <Button type="button" variant="ghost" size="xs" aria-label={`Remove range ${index + 1} on ${DAY_LONG[weekday]}`} onClick={() => setRanges((current) => current.filter((_, at) => at !== index))}>
            <X aria-hidden />
            Remove
          </Button>
        </div>
      ))}
      {error !== undefined && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The seven days, Monday first. The ranges live in the boxes' own names, so the server reads them back from the form. */
function WeekGrid({ windows }: { windows: readonly HoursWindow[] }) {
  const state = useFormState();
  const errors = state.status === "error" ? state.fields : {};
  return (
    <div className="flex flex-col">
      {WEEK_ORDER.map((weekday) => (
        <DayRow key={weekday} weekday={weekday} initial={rangesOf(windows, weekday)} error={errors[dayField(weekday)]} />
      ))}
    </div>
  );
}

/**
 * Replaces a host's whole week. Empty days are days off, and an empty week clears the hours. Fynix sends it for a host (`memberId`); a person
 * editing their own hours leaves `memberId` out.
 */
export function HoursForm({ action, memberId, timeZone, windows }: { action: Action; memberId?: string; timeZone: string; windows: readonly HoursWindow[] }) {
  return (
    <ActionForm action={action} submitLabel="Save hours" pendingLabel="Saving">
      {memberId === undefined ? null : <Hidden name="memberId" value={memberId} />}
      <FormGroup>
        <TextField name="timeZone" label="Time zone" defaultValue={timeZone} helper="The zone the hours are in, for example Europe/London." />
      </FormGroup>
      <FormGroup title="The week">
        <WeekGrid windows={windows} />
      </FormGroup>
      <p className="px-1 text-caption text-ink-muted">Saving replaces the whole week. A day with no ranges is a day off.</p>
    </ActionForm>
  );
}

/** The fields of the block form. They sit inside the `ActionForm`, and the all day switch hides the time boxes. */
function BlockFields({ timeZone }: { timeZone: string }) {
  const [allDay, setAllDay] = useState(false);
  const id = useId();
  return (
    <>
      <FormGroup title="When">
        <TextField name="date" label="Day" type="date" />
        <TextField name="endDate" label="Last day" type="date" helper="Only for a run of days. Leave it empty for one day." />
        <div className="flex items-center gap-2.5">
          <input id={`${id}-all`} type="checkbox" name="allDay" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-5 shrink-0 accent-navy" />
          <label htmlFor={`${id}-all`} className="text-body font-medium">
            All day
          </label>
        </div>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <TextField name="start" label="From" type="time" />
            <TextField name="end" label="To" type="time" />
          </div>
        )}
        <p className="text-caption text-ink-muted">Times are in {timeZone}, the zone of this host&apos;s hours.</p>
      </FormGroup>
      <FormGroup title="Why">
        <TextAreaField name="note" label="Note" rows={2} helper="For Fynix only. Agencies see the time as busy, never this note." />
      </FormGroup>
    </>
  );
}

/** Blocks a time for a host: a day, or a run of days, whole or part. The times are read in the zone of the hours above. */
export function BlockForm({ action, memberId, timeZone }: { action: Action; memberId?: string; timeZone: string }) {
  return (
    <ActionForm action={action} submitLabel="Block this time" pendingLabel="Blocking">
      {memberId === undefined ? null : <Hidden name="memberId" value={memberId} />}
      <Hidden name="timeZone" value={timeZone} />
      <BlockFields timeZone={timeZone} />
    </ActionForm>
  );
}
