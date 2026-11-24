"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { matchPages, resultGroups, SEARCH_DEBOUNCE_MS, shouldSearchServer, type PaletteResults } from "@/lib/shell/palette";
import { searchEverythingAction } from "@/server/domain/notice-actions";
import { GLYPHS } from "./sidebar";
import { flatItems, type PortalConfig } from "./nav";
import { SearchResultGroups } from "./search-results";

interface Props {
  portal: PortalConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ⌘K: jump to a page of the portal, or find a lead, a person or a company. The pages are the nav, so the palette never offers a page the person cannot
 * open. As the person types, the text is sent (after a pause) to a server action that searches as the signed-in role; the database decides what that role may
 * find, so nothing here filters by role. cmdk's own filter is off because the server's results are already the matches.
 */
export function CommandPalette({ portal, open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResults | null>(null);
  const latest = useRef(0);
  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  useEffect(() => {
    const ticket = ++latest.current;
    if (!shouldSearchServer(query)) return;
    const timer = window.setTimeout(() => {
      void searchEverythingAction(query.trim())
        .then((found) => {
          if (ticket === latest.current) setResults(found);
        })
        .catch(() => {
          if (ticket === latest.current) setResults(null);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pages = matchPages(flatItems(portal), query);
  // The last results stay on screen until the next ones arrive; below two characters there is nothing to show.
  const groups = shouldSearchServer(query) ? resultGroups(results) : [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setResults(null);
        }
        onOpenChange(next);
      }}
      shouldFilter={false}
      title="Search"
      description="Jump to a page, or find a lead, a person or a company."
    >
      <CommandInput placeholder="Search pages, leads and people" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{shouldSearchServer(query) ? "Nothing matches that." : "No page matches that."}</CommandEmpty>
        {pages.length > 0 ? (
          <CommandGroup heading="Go to">
            {pages.map((item) => {
              const Glyph = GLYPHS[item.icon];
              return (
                <CommandItem key={item.href} value={`page ${item.href}`} onSelect={() => go(item.href)}>
                  <Glyph aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
        <SearchResultGroups groups={groups} onOpen={go} />
      </CommandList>
    </CommandDialog>
  );
}
