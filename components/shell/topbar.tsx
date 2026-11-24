"use client";

import { CaretRight, Funnel, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { NoticeBell } from "./notice-bell";
import { breadcrumb, currentItem, type PortalConfig } from "./nav";
import { GLYPHS } from "./sidebar";

interface Props {
  portal: PortalConfig;
  /** Unread notices for the bell. */
  unreadNotices?: number;
}

/** The id of the marker at the top of the page. The strip reads it to know when the page has scrolled past its large title. */
export const TOP_SENTINEL_ID = "top-sentinel";

/**
 * The strip above the page. From `md` it is the trail on the left and search on the right, on the canvas. On a phone it is a glass strip
 * that stays at the top: the brand mark and search at the sides, and the section's name fading in between once the page has scrolled
 * past its own large title. The menu is the tab bar there, so there is no menu button.
 */
export function Topbar({ portal, unreadNotices = 0 }: Props) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const trail = breadcrumb(portal, pathname);
  const section = currentItem(portal, pathname);
  const Glyph = section === null ? null : GLYPHS[section.icon];
  const title = trail[trail.length - 1] ?? portal.label;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const marker = document.getElementById(TOP_SENTINEL_ID);
    if (marker === null) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(entry !== undefined && !entry.isIntersecting), { rootMargin: "-52px 0px 0px 0px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="glass-top sticky top-0 z-30 flex h-[calc(var(--topbar-h)+env(safe-area-inset-top,0px))] items-center gap-3 px-4 pt-[env(safe-area-inset-top,0px)] md:h-(--topbar-h) md:px-7 md:pt-0"
    >
      <Link href={portal.homeHref} aria-label={`${portal.label} home`} className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-peach text-navy shadow-btn-peach md:hidden">
        <Funnel aria-hidden weight="fill" size={17} />
      </Link>

      <p
        aria-hidden={!scrolled}
        className={cn(
          "min-w-0 flex-1 truncate text-center text-[16px] font-semibold tracking-[-0.01em] text-ink transition-[opacity,transform] duration-300 ease-(--ease-out) md:hidden",
          scrolled ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
        )}
      >
        {title}
      </p>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 max-md:hidden">
        <ol className="flex items-center gap-2 text-body text-ink-muted">
          <li className="flex shrink-0 items-center gap-2.5">
            {Glyph !== null ? (
              <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-navy-05 text-ink-2">
                <Glyph size={17} weight="fill" />
              </span>
            ) : null}
            <span className="max-lg:hidden">{portal.label}</span>
          </li>
          {trail.map((part, index) => {
            const last = index === trail.length - 1;
            return (
              <li key={`${part}-${index}`} className="flex min-w-0 items-center gap-2">
                <CaretRight aria-hidden size={11} weight="bold" className={cn("shrink-0 text-ink-muted/70", index === 0 && "lg:inline md:hidden")} />
                <span aria-current={last ? "page" : undefined} className={last ? "truncate font-semibold text-ink" : "truncate"}>
                  {part}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <NoticeBell seeAllHref={`${portal.homeHref}/notices`} unread={unreadNotices} />

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
        className="flex h-(--h-control) items-center gap-2 rounded-sm bg-navy-05 px-2.5 text-body text-ink-muted transition-colors hover:bg-navy-08 hover:text-ink max-md:size-9 max-md:justify-center max-md:rounded-[12px] max-md:bg-surface max-md:px-0 max-md:shadow-raised md:w-[300px]"
      >
        <MagnifyingGlass aria-hidden size={15} />
        <span className="flex-1 text-left max-md:hidden">Search</span>
        <Kbd className="max-md:hidden">⌘K</Kbd>
      </button>

      <CommandPalette portal={portal} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
