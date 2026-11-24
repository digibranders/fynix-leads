"use client";

import { CaretLeft } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE, type SidebarPreference } from "./sidebar-preference";

/** The widths where `auto` shows the rail. Keep in step with the media query in globals.css. */
const TABLET = "(min-width: 768px) and (max-width: 1099px)";

interface SidebarState {
  /** True while the sidebar shows as the narrow icon rail. */
  readonly rail: boolean;
  readonly toggle: () => void;
}

const SidebarContext = createContext<SidebarState>({ rail: false, toggle: () => undefined });

export function useSidebar(): SidebarState {
  return useContext(SidebarContext);
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(TABLET);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-sm focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary";

interface Props {
  /** What the cookie said when the page was rendered, so the sidebar is the right width from the first paint. */
  initial: SidebarPreference;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The frame of every portal page: it owns the sidebar's width. The width and the rail's look are CSS, driven by `data-sidebar` (see
 * globals.css), so nothing jumps on load. State here only decides what the toggle does and what it is called, and saves the choice.
 */
export function ShellFrame({ initial, sidebar, children }: Props) {
  const [preference, setPreference] = useState<SidebarPreference>(initial);
  const tablet = useSyncExternalStore(subscribe, () => window.matchMedia(TABLET).matches, () => false);
  const rail = preference === "collapsed" || (preference === "auto" && tablet);

  const toggle = useCallback(() => {
    const next: SidebarPreference = rail ? "expanded" : "collapsed";
    setPreference(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, [rail]);

  const value = useMemo(() => ({ rail, toggle }), [rail, toggle]);

  // Cmd or Ctrl and B, the shortcut editors use for the sidebar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <SidebarContext value={value}>
      <div data-sidebar={preference} className="shell min-h-dvh bg-canvas max-md:bg-navy">
        <a href="#main" className={SKIP_LINK}>
          Skip to content
        </a>
        <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-30 w-(--sidebar-w) bg-navy transition-[width] duration-300 ease-(--ease-out) max-md:hidden">
          {sidebar}
          {/* The handle on the sidebar's edge: always in view, so folding the sidebar never needs hunting for. */}
          <button
            type="button"
            onClick={toggle}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            title={`${rail ? "Expand" : "Collapse"} sidebar (Ctrl or Cmd and B)`}
            className="absolute top-[22px] -right-3.5 z-40 grid size-7 place-items-center rounded-full bg-surface text-ink shadow-raised outline-offset-2 transition-[box-shadow,background-color] duration-(--dur-hover) hover:bg-offwhite hover:shadow-lift focus-visible:outline-2 focus-visible:outline-navy"
          >
            <CaretLeft aria-hidden size={14} weight="bold" className={cn("transition-transform duration-300 ease-(--ease-out)", rail && "rotate-180")} />
          </button>
        </aside>
        {children}
      </div>
    </SidebarContext>
  );
}
