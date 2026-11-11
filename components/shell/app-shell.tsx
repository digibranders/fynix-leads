"use client";

import { usePathname } from "next/navigation";
import { roleFromPath } from "./nav-config";
import { RailPanel } from "./rail";

/**
 * The floating navy rail plus the canvas. Layout switches by CSS only:
 * from `lg` the full rail, from `md` an icon rail, below `md` no rail (the page header opens it in a sheet).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-3 left-3 z-30 flex w-[72px] flex-col overflow-hidden rounded-xl bg-navy shadow-rail max-md:hidden lg:w-[220px]">
        <RailPanel role={roleFromPath(pathname)} pathname={pathname} collapsing />
      </aside>

      <main
        id="main"
        tabIndex={-1}
        className="min-h-dvh px-4 pt-5 pb-6 outline-none md:pr-6 md:pl-[100px] lg:pl-[248px]"
      >
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
