/** The fixed id of a meeting's calendar event: its reference in lower case at a domain that cannot exist. Shared by the emailed file and the browser file so both agree. */
export function meetingUid(meetingRef: string): string {
  return `${meetingRef.toLowerCase()}@leads.invalid`;
}
