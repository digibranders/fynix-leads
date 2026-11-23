"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
}

interface ChoiceProps {
  readonly options: readonly ChoiceOption[];
  /** The chosen value; "" means nothing chosen. Leave out for an uncontrolled field that starts at `defaultValue`. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** Posts the value with the form under this name. */
  readonly name?: string;
  readonly id?: string;
  readonly placeholder?: string;
  /** Shown, and the control disabled, when there is nothing to choose from. */
  readonly emptyLabel?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

/**
 * The one dropdown of the app: a closed button that opens a styled list, in place of the browser's own `select` (whose list looks
 * different in every browser and cannot be styled). It takes the same options, name and value a `select` would.
 */
export function Choice({ options, value, defaultValue, onValueChange, name, id, placeholder = "Choose", emptyLabel = "Nothing to choose from", required, disabled, invalid, className, ...aria }: ChoiceProps) {
  const controlled = value !== undefined;
  return (
    <Select
      items={options as ChoiceOption[]}
      name={name}
      required={required}
      disabled={disabled || options.length === 0}
      {...(controlled ? { value: value === "" ? null : value } : { defaultValue: defaultValue === undefined || defaultValue === "" ? null : defaultValue })}
      onValueChange={(next) => onValueChange?.(typeof next === "string" ? next : "")}
    >
      <SelectTrigger id={id} aria-invalid={invalid} aria-label={aria["aria-label"]} aria-describedby={aria["aria-describedby"]} className={cn("w-full text-base md:text-sm", className)}>
        <SelectValue placeholder={options.length === 0 ? emptyLabel : placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-72 min-w-[var(--anchor-width)]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="[&>span:first-child]:whitespace-normal [&>span:first-child]:break-words">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
