"use client";

import { useSyncExternalStore } from "react";
import { formatDayInZone, formatInZone, formatTimeInZone, zoneAbbreviation } from "@/lib/time/zones";

const subscribe = () => () => undefined;
/** The viewer's own IANA zone in the browser. The server has no way to know it, so the server snapshot is UTC and the page corrects itself on hydration. */
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "UTC";

type Style = "full" | "day" | "time";

/**
 * A moment shown in the viewer's own time zone, with the zone named ("Sat 28 Nov, 7:30 pm GMT"). Never a bare clock time:
 * leads cross time zones, so an unlabelled time is a wrong time for someone.
 */
/** The viewer's zone, for components that lay a moment out in their own way (the time slots). */
export function useViewerZone(): string {
  return useSyncExternalStore(subscribe, browserZone, serverZone);
}

export function When({ at, style = "full", className }: { at: Date | string; style?: Style; className?: string }) {
  const zone = useViewerZone();
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return <span className={className}>Unknown time</span>;
  const text = style === "day" ? formatDayInZone(date, zone) : style === "time" ? `${formatTimeInZone(date, zone)} ${zoneAbbreviation(date, zone)}` : formatInZone(date, zone);
  return (
    <time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
