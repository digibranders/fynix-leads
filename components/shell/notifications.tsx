"use client";

import { useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Sample notifications. Each one is worded the same way for both roles, so neither side learns the other's identity. */
const NOTIFICATIONS = [
  { id: "n1", text: "LD-5T6C was submitted for review", when: "12 minutes ago" },
  { id: "n2", text: "LD-9F1K was approved", when: "3 hours ago" },
  { id: "n3", text: "A meeting for LD-8R2D was scheduled for Thu 12 Nov", when: "Yesterday" },
] as const;

export function Notifications() {
  const [allRead, setAllRead] = useState(false);
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label="Notifications" className="max-md:size-10" />}
      >
        <Bell aria-hidden className="size-[18px]" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex h-10 items-center justify-between border-b pr-1.5 pl-3">
          <h2 className="text-sm font-medium">Notifications</h2>
          <Button variant="ghost" size="xs" disabled={allRead} onClick={() => setAllRead(true)}>
            Mark all as read
          </Button>
        </div>
        <ul className="divide-y">
          {NOTIFICATIONS.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 px-3 py-2.5">
              <p className={cn("text-sm", allRead ? "text-muted-foreground" : "font-medium text-foreground")}>
                {item.text}
              </p>
              <p className="text-xs text-muted-foreground">{item.when}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
