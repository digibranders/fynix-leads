import { meetingUid } from "@/lib/meetings/uid";

/**
 * The calendar file that goes with a meeting email, made on the server (phase 6). Every copy of one meeting shares one fixed id, so a later file replaces the
 * event instead of adding a second one, and its SEQUENCE rises with every move or cancellation (the database keeps the counter: `meeting.ics_sequence`).
 * The id, the product id and the organiser name nobody: no company, no portal, no person. The organiser is the neutral sender; the attendee is the one recipient.
 */
export type CalendarMethod = "REQUEST" | "CANCEL";

export interface CalendarEvent {
  /** The meeting's public reference, `MTG-ABCD`. */
  readonly meetingRef: string;
  readonly sequence: number;
  readonly method: CalendarMethod;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly summary: string;
  readonly location: string | null;
  readonly organiser: { readonly address: string; readonly name: string };
  readonly attendee: string;
  /** When the file was made. Passed in so a test gets the same file twice. */
  readonly stamp: Date;
}

export { meetingUid };

const utc = (date: Date): string => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes a TEXT value (RFC 5545 section 3.3.11). */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** A parameter value in double quotes, with the characters a quoted value cannot hold removed. */
function quoted(value: string): string {
  return `"${value.replace(/["\r\n]/g, "")}"`;
}

/** Folds a content line at 75 octets, each continuation starting with a space (RFC 5545 section 3.1). Never splits a character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The `.ics` text, with CRLF line ends. */
export function buildIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meeting calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${meetingUid(event.meetingRef)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${text(event.summary)}`,
    ...(event.location === null ? [] : [`LOCATION:${text(event.location)}`, `DESCRIPTION:${text(`Join: ${event.location}`)}`]),
    `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${quoted(event.organiser.name)}:mailto:${event.organiser.address}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${event.attendee}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
