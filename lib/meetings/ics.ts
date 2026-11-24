export interface IcsEventParams {
  readonly uid: string;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly startTime: Date;
  readonly durationMinutes: number;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
}

function formatIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/**
 * Generates an RFC 5545 compliant iCalendar string for a meeting event.
 */
export function generateIcsCalendar(params: IcsEventParams): string {
  const {
    uid,
    summary,
    description,
    location,
    startTime,
    durationMinutes,
    organizerName,
    organizerEmail,
  } = params;

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const dtStamp = formatIcsDateTime(new Date());
  const dtStart = formatIcsDateTime(startTime);
  const dtEnd = formatIcsDateTime(endTime);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meeting calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  if (organizerEmail && organizerName) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(organizerName)}:mailto:${organizerEmail}`);
  } else if (organizerEmail) {
    lines.push(`ORGANIZER:mailto:${organizerEmail}`);
  }

  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}
