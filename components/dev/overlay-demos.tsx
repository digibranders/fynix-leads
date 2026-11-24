"use client";

import { Copy, DotsThree, FileText, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Specimen } from "./specimen";

export function OverlayDemos() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
      <Specimen caption="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline this lead</DialogTitle>
              <DialogDescription>Say why. Fynix sees your reason and the lead is closed.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
              <DialogClose render={<Button variant="destructive" />}>Decline lead</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen caption="Drawer (sheet)">
        <Sheet>
          <SheetTrigger render={<Button variant="secondary" />}>Open drawer</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add a coordinator</SheetTitle>
              <SheetDescription>Forms open in a drawer so the list stays in view.</SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <SheetClose render={<Button />}>Add coordinator</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Specimen>

      <Specimen caption="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label="Row actions" />}>
            <DotsThree aria-hidden weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem>
              <FileText aria-hidden />
              Open lead
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy aria-hidden />
              Copy reference
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <XCircle aria-hidden />
              Decline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>

      <Specimen caption="Popover">
        <Popover>
          <PopoverTrigger render={<Button variant="secondary" />}>Open popover</PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader>
              <PopoverTitle>Waiting more than 24 hours</PopoverTitle>
              <PopoverDescription>A reminder goes to the client once a lead has been pending for a day.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </Specimen>

      <Specimen caption="Tooltip">
        <Tooltip>
          <TooltipTrigger render={<Button variant="secondary" size="icon" aria-label="Copy reference" />}>
            <Copy aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Copy reference</TooltipContent>
        </Tooltip>
      </Specimen>

      <Specimen caption="Toast with undo">
        <Button
          variant="secondary"
          onClick={() =>
            toast("Time accepted", {
              description: "The meeting is booked.",
              action: { label: "Undo", onClick: () => toast("Undone") },
            })
          }
        >
          Show toast
        </Button>
      </Specimen>
    </div>
  );
}
