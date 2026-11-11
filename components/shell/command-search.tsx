"use client";

import { useCallback, useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
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
import { Kbd } from "@/components/ui/kbd";
import { SAMPLE_LEADS } from "@/lib/sample/data";
import { NAV, type Role } from "./nav-config";

/** The shared CommandItem reserves room for a selected check; the palette does not use it. */
const HIDE_CHECK = "[&>svg:last-child]:hidden";

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
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="font-normal text-muted-foreground max-sm:size-10 max-sm:px-0 sm:w-52 sm:justify-start sm:gap-2"
      >
        <MagnifyingGlass aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Search</span>
        <Kbd className="ml-auto max-sm:hidden">Ctrl K</Kbd>
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
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)} className={HIDE_CHECK}>
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
                    className={HIDE_CHECK}
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
        </Command>
      </CommandDialog>
    </>
  );
}
