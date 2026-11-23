"use client";

import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { Choice, type ChoiceOption } from "@/components/ui/choice";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Dates travel as "YYYY-MM-DD" and times as "HH:mm", exactly what the browser's own date and time boxes post. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

interface Day {
  readonly year: number;
  readonly month: number; // 0 to 11
  readonly day: number;
}

function parseDay(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const check = new Date(year, month, day);
  return check.getFullYear() === year && check.getMonth() === month && check.getDate() === day ? { year, month, day } : null;
}

function formatDay(day: Day): string {
  return `${String(day.year).padStart(4, "0")}-${String(day.month + 1).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

function today(): Day {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function show(value: string): string {
  const day = parseDay(value);
  if (day === null) return "";
  return new Date(day.year, day.month, day.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** The cells of one month, Monday first: leading blanks, then the days. */
function monthCells(year: number, month: number): readonly (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: length }, (_, index) => index + 1)];
}

interface DateFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly name?: string;
  readonly id?: string;
  readonly placeholder?: string;
  readonly min?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

/** A date: a button that opens a month calendar, in place of the browser's own date picker. */
export function DateField({ value, onChange, name, id, placeholder = "Pick a date", min, required, disabled, invalid, className, ...aria }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const chosen = parseDay(value);
  const [shown, setShown] = useState<{ year: number; month: number }>(() => ({ year: (chosen ?? today()).year, month: (chosen ?? today()).month }));
  const earliest = min === undefined ? null : parseDay(min);
  const now = today();

  function step(by: number): void {
    const next = new Date(shown.year, shown.month + by, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  }

  function pick(day: Day): void {
    onChange(formatDay(day));
    setOpen(false);
  }

  function tooEarly(day: Day): boolean {
    return earliest !== null && formatDay(day) < formatDay(earliest);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const target = chosen ?? now;
          setShown({ year: target.year, month: target.month });
        }
        setOpen(next);
      }}
    >
      {name !== undefined ? <input type="hidden" name={name} value={value} /> : null}
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        className={cn(
          "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-sm bg-input pr-3 pl-3.5 text-left text-base outline-none transition-[box-shadow,background-color] select-none hover:bg-navy-07 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:bg-red-soft aria-invalid:ring-2 aria-invalid:ring-red-solid md:text-sm",
          chosen === null && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{chosen === null ? placeholder : show(value)}</span>
        <CalendarBlank aria-hidden size={16} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem] gap-2 p-3">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-navy-05">
            <CaretLeft aria-hidden size={16} weight="bold" />
          </button>
          <p aria-live="polite" className="text-table font-semibold text-ink">
            {MONTHS[shown.month]} {shown.year}
          </p>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-navy-05">
            <CaretRight aria-hidden size={16} weight="bold" />
          </button>
        </div>
        <div role="grid" aria-label={`${MONTHS[shown.month]} ${shown.year}`} className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} role="columnheader" className="pb-1 text-[11px] font-semibold text-ink-muted">
              {weekday.slice(0, 2)}
            </span>
          ))}
          {monthCells(shown.year, shown.month).map((cell, index) => {
            if (cell === null) return <span key={`blank-${index}`} aria-hidden />;
            const day: Day = { year: shown.year, month: shown.month, day: cell };
            const selected = chosen !== null && formatDay(chosen) === formatDay(day);
            const isToday = formatDay(now) === formatDay(day);
            return (
              <button
                key={cell}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-current={isToday ? "date" : undefined}
                disabled={tooEarly(day)}
                onClick={() => pick(day)}
                className={cn(
                  "mx-auto grid size-9 place-items-center rounded-full text-table transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                  selected ? "bg-navy font-semibold text-offwhite" : "text-ink hover:bg-navy-05",
                  isToday && !selected && "font-semibold text-peach-deep shadow-[inset_0_0_0_1.5px_var(--peach)]",
                )}
              >
                {cell}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button type="button" disabled={tooEarly(now)} onClick={() => pick(now)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-navy-05 disabled:opacity-35">
            Today
          </button>
          {required ? null : (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-navy-05"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function timeOptions(stepMinutes: number, current: string): readonly ChoiceOption[] {
  const options: ChoiceOption[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const text = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    options.push({ value: text, label: text });
  }
  // A time that is not on the grid (saved as 09:10, say) stays choosable and shown.
  if (/^\d{2}:\d{2}$/.test(current) && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  return options;
}

interface TimeFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly name?: string;
  readonly id?: string;
  readonly placeholder?: string;
  /** Minutes between the times offered. */
  readonly stepMinutes?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

/** A time of day, chosen from a styled list at a fixed step, in place of the browser's own time picker. */
export function TimeField({ value, onChange, stepMinutes = 15, placeholder = "Pick a time", ...rest }: TimeFieldProps) {
  return <Choice options={timeOptions(stepMinutes, value)} value={value} onValueChange={onChange} placeholder={placeholder} {...rest} />;
}

/** A date and a time side by side. The value is "YYYY-MM-DDTHH:mm", or "" while either half is missing. */
export function DateTimeField({ value, onChange, min, disabled, invalid, "aria-label": ariaLabel }: { readonly value: string; readonly onChange: (value: string) => void; readonly min?: string; readonly disabled?: boolean; readonly invalid?: boolean; readonly "aria-label"?: string }) {
  const [date, time] = value.split("T");
  const day = date ?? "";
  const clock = time ?? "";
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
      <DateField value={day} min={min} disabled={disabled} invalid={invalid} aria-label={ariaLabel === undefined ? "Date" : `${ariaLabel}, date`} onChange={(next) => onChange(next === "" ? "" : `${next}T${clock === "" ? "09:00" : clock}`)} />
      <TimeField value={clock} disabled={disabled} invalid={invalid} aria-label={ariaLabel === undefined ? "Time" : `${ariaLabel}, time`} onChange={(next) => onChange(next === "" ? "" : `${day === "" ? formatDay(today()) : day}T${next}`)} />
    </div>
  );
}
