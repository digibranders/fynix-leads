"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { GLYPHS } from "./sidebar";
import { flatItems, type PortalConfig } from "./nav";

interface Props {
  portal: PortalConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** ⌘K: jump to any page of the portal. The list is the nav, so it can never offer a page the person cannot open. */
export function CommandPalette({ portal, open, onOpenChange }: Props) {
  const router = useRouter();
  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page of the portal.">
      <CommandInput placeholder="Go to a page" />
      <CommandList>
        <CommandEmpty>No page matches that.</CommandEmpty>
        <CommandGroup heading="Go to">
          {flatItems(portal).map((item) => {
            const Glyph = GLYPHS[item.icon];
            return (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <Glyph aria-hidden />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
