"use client";

import { Copy, DotsThree, FileText, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Specimen } from "./specimen";
import { ToastButton } from "./toast-button";

export function OverlayDemos() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      <Specimen caption="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve LD-4K9P</DialogTitle>
              <DialogDescription>
                The agency will see this as a decision from Client. You can change the decision from the lead record.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
              <DialogClose render={<Button />}>Approve <Kbd>A</Kbd></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen caption="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label="Row actions" />}>
            <DotsThree aria-hidden weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem>
              <FileText aria-hidden />
              Open lead record
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy aria-hidden />
              Copy reference
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <XCircle aria-hidden />
              Reject
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
              <PopoverDescription>
                A reminder goes to the client once a lead has been pending for a day.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </Specimen>

      <Specimen caption="Tooltip">
        <Tooltip>
          <TooltipTrigger render={<Button variant="secondary" size="icon" aria-label="Copy reference" />}>
            <Copy aria-hidden />
          </TooltipTrigger>
          <TooltipContent>
            Copy reference <Kbd>C</Kbd>
          </TooltipContent>
        </Tooltip>
      </Specimen>

      <Specimen caption="Toast with undo">
        <ToastButton />
      </Specimen>
    </div>
  );
}
