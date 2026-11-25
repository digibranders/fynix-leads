"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CONTROL } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SearchChoiceProps {
  readonly options: readonly string[];
  readonly defaultValue?: string;
  /** Posts the chosen value with the form under this name. */
  readonly name: string;
  readonly id?: string;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  /** A value that is not in `options` may be typed and used, when it looks like one of this kind (for a time zone: Area/City). */
  readonly acceptsTyped?: (text: string) => boolean;
  readonly invalid?: boolean;
  readonly "aria-describedby"?: string;
}

/**
 * The app's dropdown with a search box, for a list too long to scan: a closed button like every other dropdown, and a styled list under it that
 * filters as you type. The chosen value posts under `name`. With `acceptsTyped` a value that is not in the list can still be used, so a long
 * tail (any time zone) does not need a long list.
 */
export function SearchChoice({ options, defaultValue = "", name, id, placeholder = "Choose", searchPlaceholder = "Search", acceptsTyped, invalid, ...aria }: SearchChoiceProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  // A value the list does not carry (an old time zone kept on a record) is still shown and kept.
  const all = value !== "" && !options.includes(value) ? [value, ...options] : options;
  const typed = query.trim();
  const offerTyped = acceptsTyped !== undefined && typed !== "" && acceptsTyped(typed) && !all.some((option) => option.toLowerCase() === typed.toLowerCase());

  const choose = (next: string) => {
    setValue(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <input type="hidden" name={name} value={value} />
      <PopoverTrigger
        id={id}
        type="button"
        aria-invalid={invalid}
        aria-describedby={aria["aria-describedby"]}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        className={cn(
          CONTROL,
          "flex h-(--h-control) w-full items-center justify-between gap-2 rounded-sm py-2 pr-2.5 pl-3 text-left text-base whitespace-nowrap select-none md:text-[13.5px] aria-expanded:bg-surface aria-expanded:shadow-[inset_0_0_0_2px_var(--navy)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
        )}
      >
        <span className={cn("line-clamp-1 flex-1", value === "" && "text-ink-muted")}>{value === "" ? placeholder : value}</span>
        <CaretDownIcon aria-hidden className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 gap-0 p-0">
        <Command className="p-0">
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList id={listId} className="max-h-64 p-1.5">
            <CommandEmpty>Nothing matches. Keep typing, or pick another.</CommandEmpty>
            {offerTyped ? (
              <CommandItem value={`use ${typed}`} onSelect={() => choose(typed)}>
                Use {typed}
              </CommandItem>
            ) : null}
            {all.map((option) => (
              <CommandItem key={option} value={option} data-checked={option === value} onSelect={() => choose(option)}>
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
