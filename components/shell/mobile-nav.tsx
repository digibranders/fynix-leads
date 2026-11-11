"use client";

import { useState } from "react";
import { List, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { roleFromPath } from "./nav-config";
import { RailPanel } from "./rail";

/** Phones only: the page header's menu button opens the full rail in a navy sheet. */
export function MobileNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            className={`bg-navy-05 hover:bg-navy-07 ${className ?? ""}`}
          />
        }
      >
        <List aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[272px] max-w-[calc(100vw-3rem)] gap-0 bg-navy p-0 text-offwhite outline-none sm:max-w-[272px]"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation and the view switcher.</SheetDescription>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close menu"
              className="absolute top-[22px] right-3 z-10 text-on-navy-text outline-offwhite hover:bg-on-navy-07 hover:text-offwhite"
            />
          }
        >
          <X aria-hidden />
        </SheetClose>
        <RailPanel role={roleFromPath(pathname)} pathname={pathname} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
