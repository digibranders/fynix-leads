"use client";

import { DotsThreeOutline } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { currentItem, moreGroups, tabItems, type PortalConfig } from "./nav";
import { MoreSheet } from "./more-sheet";
import { GLYPHS } from "./sidebar";

interface Props {
  portal: PortalConfig;
  counts: Readonly<Record<string, number>>;
  footer: React.ReactNode;
}

/** Wait for the sheet to be on its way down before the search palette takes the screen. */
const PALETTE_DELAY_MS = 260;

/**
 * The phone's tab bar: four tabs and More, on a floating glass capsule. A lens slides to the open tab on a spring and stretches as it
 * goes. A tap moves the lens at once, before the page has loaded, so the bar answers the finger and not the network. More opens the
 * sheet, and the lens waits on More until it closes. From `md` the sidebar replaces all of this.
 */
export function TabBar({ portal, counts, footer }: Props) {
  const pathname = usePathname();
  const tabs = tabItems(portal);
  const groups = moreGroups(portal);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // A tab the person has tapped but whose page has not arrived. It counts only while the path it was tapped on is still the path.
  const [tapped, setTapped] = useState<{ href: string; from: string | null } | null>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const lastIndex = useRef<number | null>(null);

  const here = currentItem(portal, pathname)?.href ?? null;
  const shown = tapped !== null && tapped.from === pathname ? tapped.href : here;
  const found = tabs.findIndex((tab) => tab.href === shown);
  const index = moreOpen || found === -1 ? tabs.length : found;

  useEffect(() => {
    const lens = lensRef.current;
    const from = lastIndex.current;
    lastIndex.current = index;
    if (lens === null || from === null || from === index) return;
    if (typeof lens.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spring = getComputedStyle(lens).getPropertyValue("--ease-lens").trim() || "ease-out";
    const duration = Number.parseFloat(getComputedStyle(lens).getPropertyValue("--dur-lens")) || 620;
    lens.animate([{ transform: `translateX(${from * 100}%)` }, { transform: `translateX(${index * 100}%)` }], { duration, easing: spring });
    // The lens stretches on the way and settles back, the way liquid glass does. `scale` is its own property, so it never fights the move.
    lens.animate([{ scale: "1 1" }, { scale: "1.14 0.9", offset: 0.3 }, { scale: "1 1" }], { duration, easing: "ease-out" });
  }, [index]);

  function search(): void {
    setMoreOpen(false);
    window.setTimeout(() => setPaletteOpen(true), PALETTE_DELAY_MS);
  }

  const itemClass = "relative z-10 flex flex-col items-center justify-center gap-[3px] rounded-[29px] outline-offset-[-3px] outline-offwhite";

  return (
    <>
      <nav aria-label="Main" className="glass-ink fixed inset-x-3.5 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--tabbar-gap))] z-40 h-(--tabbar-h) overflow-hidden rounded-[34px] p-[5px] md:hidden">
        <div className="relative grid h-full grid-cols-5">
          <span ref={lensRef} aria-hidden className="tab-lens absolute inset-y-0 left-0 w-1/5 rounded-[29px]" style={{ transform: `translateX(${index * 100}%)` }} />
          {tabs.map((tab, position) => {
            const Glyph = GLYPHS[tab.icon];
            const on = index === position;
            const count = tab.countKey ? (counts[tab.countKey] ?? 0) : 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={here === tab.href ? "page" : undefined}
                onClick={() => {
                  // Tapping the open tab scrolls to the top, as it does on a phone.
                  if (here === tab.href) window.scrollTo({ top: 0, behavior: "smooth" });
                  else setTapped({ href: tab.href, from: pathname });
                }}
                className={cn(itemClass, "group/tab")}
              >
                <span className="relative grid place-items-center transition-transform duration-[360ms] ease-(--ease-lens) group-active/tab:scale-90 group-active/tab:duration-100">
                  <Glyph size={24} weight={on ? "fill" : "regular"} className={cn("transition-colors duration-200", on ? "text-peach" : "text-offwhite/60")} />
                  {count > 0 ? (
                    <b key={count} aria-label={`${count} waiting`} className="tab-badge absolute -top-1.5 left-[calc(50%+4px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-peach px-1 text-[11px] font-extrabold text-navy shadow-[0_0_0_2px_rgb(12_30_46)]">
                      {count}
                    </b>
                  ) : null}
                </span>
                <span className={cn("text-[10px] font-semibold tracking-[0.005em] transition-colors duration-200", on ? "text-offwhite" : "text-offwhite/60")}>
                  {tab.href === portal.homeHref ? "Home" : tab.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className={cn(itemClass, "group/tab")}
          >
            <span className="grid place-items-center transition-transform duration-[360ms] ease-(--ease-lens) group-active/tab:scale-90 group-active/tab:duration-100">
              <DotsThreeOutline size={24} weight={index === tabs.length ? "fill" : "regular"} className={cn("transition-colors duration-200", index === tabs.length ? "text-peach" : "text-offwhite/60")} />
            </span>
            <span className={cn("text-[10px] font-semibold tracking-[0.005em] transition-colors duration-200", index === tabs.length ? "text-offwhite" : "text-offwhite/60")}>More</span>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} groups={groups} counts={counts} footer={footer} onSearch={search} />
      <CommandPalette portal={portal} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
