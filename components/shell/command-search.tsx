"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MagnifyingGlass } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SAMPLE_LEADS } from "@/lib/sample/data";
import { NAV, type Role } from "./nav-config";

/** The shared CommandItem reserves room for a selected check, which the palette does not use. Selected rows take a navy 5% tint. */
const ITEM = "[&>svg:last-child]:hidden data-selected:bg-navy-05";

/** Ctrl+K and Cmd+K both open the palette. */
function useSearchShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

export function CommandSearch({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  useSearchShortcut(toggle);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        className="rounded-sm bg-navy-05 text-[14px] font-normal text-ink-muted hover:bg-navy-07 lg:w-[220px] lg:justify-start lg:gap-2.5 lg:px-3.5 lg:pr-2 xl:w-[300px]"
      >
        <MagnifyingGlass aria-hidden className="size-[18px]" />
        <span className="max-lg:sr-only">Search leads</span>
        <Kbd className="ml-auto max-lg:hidden">Ctrl K</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Find a screen or a lead by reference or prospect name."
        className="sm:max-w-lg"
      >
        <Command loop>
          <CommandInput placeholder={role === "client" ? "Search screens and leads" : "Search screens"} />
          <CommandList>
            <CommandEmpty>No screen or lead matches that search.</CommandEmpty>
            <CommandGroup heading="Screens">
              {NAV[role].map((item) => (
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)} className={ITEM}>
                  <item.icon aria-hidden className="text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {role === "client" && (
              <CommandGroup heading="Leads">
                {SAMPLE_LEADS.map((lead) => (
                  <CommandItem
                    key={lead.ref}
                    value={`${lead.ref} ${lead.prospect.name} ${lead.prospect.company}`}
                    onSelect={() => go(`/client/leads/${lead.ref}`)}
                    className={ITEM}
                  >
                    <span className="w-16 shrink-0 font-mono text-table">{lead.ref}</span>
                    <span className="truncate">{lead.prospect.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground max-sm:hidden">
                      {lead.prospect.company}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="mt-1.5 flex items-center gap-4 max-sm:hidden px-3 pt-2.5 pb-1.5 text-xs text-muted-foreground shadow-[inset_0_1px_0_var(--line)]">
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd aria-label="Up arrow"><ArrowUp aria-hidden weight="bold" /></Kbd>
                <Kbd aria-label="Down arrow"><ArrowDown aria-hidden weight="bold" /></Kbd>
              </KbdGroup>
              move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Enter</Kbd>
              open
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
