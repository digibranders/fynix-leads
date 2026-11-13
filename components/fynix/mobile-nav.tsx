"use client";

import { List, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FynixRail } from "./rail";

/** Phones only: the top bar's menu button opens the full rail in a navy sheet. */
export function FynixMobileNav({ footer }: { footer: React.ReactNode }) {
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
        <FynixRail onNavigate={() => setOpen(false)} footer={footer} />
      </SheetContent>
    </Sheet>
  );
}
