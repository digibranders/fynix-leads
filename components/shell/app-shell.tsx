"use client";

import { useState } from "react";
import { List } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CommandSearch } from "./command-search";
import { roleFromPath, titleFor } from "./nav-config";
import { NavLinks } from "./nav-links";
import { Notifications } from "./notifications";
import { RoleSwitcher } from "./role-switcher";

const PROTOTYPE_NOTE = "Prototype with sample data. Nothing is saved.";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = roleFromPath(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex md:w-14 lg:w-[232px]">
        <div className="flex h-14 shrink-0 items-center px-2 lg:px-3">
          <Link
            href="/"
            aria-label="Fynix Leads, prototype index"
            className="mx-auto rounded-md px-1 text-[15px] font-semibold tracking-tight text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mx-0 lg:px-2.5"
          >
            <span className="lg:hidden">FL</span>
            <span className="hidden lg:inline">Fynix Leads</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1 lg:px-3">
          <NavLinks role={role} pathname={pathname} collapsible />
        </div>
        <div className="flex shrink-0 flex-col gap-2 p-2 lg:p-3">
          <RoleSwitcher role={role} compact className="lg:hidden" />
          <RoleSwitcher role={role} className="max-lg:hidden" />
          <p className="text-xs text-muted-foreground max-lg:hidden">{PROTOTYPE_NOTE}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu" className="-ml-2 max-md:size-10 md:hidden" />
              }
            >
              <List aria-hidden className="size-[18px]" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 sm:max-w-72">
              <div className="flex h-14 shrink-0 items-center px-3">
                <SheetTitle className="px-2.5 text-[15px] font-semibold tracking-tight text-primary">
                  Fynix Leads
                </SheetTitle>
                <SheetDescription className="sr-only">Main navigation</SheetDescription>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-1">
                <NavLinks role={role} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="flex shrink-0 flex-col gap-2 p-3">
                <RoleSwitcher role={role} />
                <p className="text-xs text-muted-foreground">{PROTOTYPE_NOTE}</p>
              </div>
            </SheetContent>
          </Sheet>

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{titleFor(role, pathname)}</h1>
          <CommandSearch role={role} />
          <Notifications />
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
