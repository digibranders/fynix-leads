"use client";

import { List, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TenantRail } from "./rail";
import type { TenantNavItem } from "./nav-config";

type Props = {
  items: readonly TenantNavItem[];
  portalLabel: string;
  homeHref: string;
  footer: React.ReactNode;
};

export function TenantMobileNav({ items, portalLabel, homeHref, footer }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" className="text-offwhite hover:bg-on-navy-10" />}>
        <List aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-[272px] max-w-[calc(100vw-3rem)] gap-0 bg-navy p-0 text-offwhite outline-none sm:max-w-[272px]">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation.</SheetDescription>
        <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Close menu" className="absolute top-[22px] right-3 z-10 text-on-navy-text outline-offwhite hover:bg-on-navy-07 hover:text-offwhite" />}>
          <X aria-hidden />
        </SheetClose>
        <TenantRail items={items} portalLabel={portalLabel} homeHref={homeHref} onNavigate={() => setOpen(false)} footer={footer} />
      </SheetContent>
    </Sheet>
  );
}
