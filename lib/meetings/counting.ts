import { monthInZone } from "@/lib/time/zones";

/**
 * Returns the counting month for a meeting in the campaign time zone (format: YYYY-MM).
 */
export function meetingCountingMonth(meetingTime: Date, timeZone: string): string {
  return monthInZone(meetingTime, timeZone);
}
