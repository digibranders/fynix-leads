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
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={allRead ? "Notifications" : `Notifications, ${NOTIFICATIONS.length} unread`}
            className="relative bg-navy-05 hover:bg-navy-07 aria-expanded:bg-navy-07"
          />
        }
      >
        <Bell aria-hidden />
        {!allRead && (
          <span
            aria-hidden
            className="absolute top-[9px] right-2.5 size-[9px] rounded-full bg-peach shadow-[0_0_0_2px_var(--canvas)]"
          />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0 pb-1.5">
        <div className="flex h-14 items-center justify-between pr-3 pl-4">
          <h2 className="text-value font-semibold">Notifications</h2>
          <Button variant="ghost" size="xs" disabled={allRead} onClick={() => setAllRead(true)}>
            Mark all as read
          </Button>
        </div>
        <ul>
          {NOTIFICATIONS.map((item) => (
            <li key={item.id} className="px-4 [&:not(:first-child)>div]:border-t">
              <div className="flex gap-3 py-3">
                <span
                  aria-hidden
                  className={cn("mt-[7px] size-2 shrink-0 rounded-full", allRead ? "bg-transparent" : "bg-peach")}
                />
                <div className="min-w-0">
                  <p className={cn("text-[14px] leading-5", allRead ? "text-ink-2" : "font-medium text-ink")}>{item.text}</p>
                  <p className="mt-0.5 text-label text-ink-muted">{item.when}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
