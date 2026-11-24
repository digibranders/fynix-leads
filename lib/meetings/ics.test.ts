import { describe, expect, it } from "vitest";
import { generateIcsCalendar } from "./ics";

describe("generateIcsCalendar", () => {
  it("generates a valid iCalendar event with CRLF line endings", () => {
    const startTime = new Date("2026-12-10T14:30:00.000Z");
    const ics = generateIcsCalendar({
      uid: "mtg-12345@leads.invalid",
      summary: "Discovery Call: Kestrel Ledger & Prospect",
      description: "Discussion on automated financial reconciliations.",
      location: "https://meet.google.com/abc-defg-hij",
      startTime,
      durationMinutes: 45,
      organizerName: "Alex Vance",
      organizerEmail: "alex@kestrel.com",
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//Meeting calendar//EN\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:mtg-12345@leads.invalid\r\n");
    expect(ics).toContain("DTSTART:20261210T143000Z\r\n");
    expect(ics).toContain("DTEND:20261210T151500Z\r\n");
    expect(ics).toContain("SUMMARY:Discovery Call: Kestrel Ledger & Prospect\r\n");
    expect(ics).toContain("DESCRIPTION:Discussion on automated financial reconciliations.\r\n");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc-defg-hij\r\n");
    expect(ics).toContain("ORGANIZER;CN=Alex Vance:mailto:alex@kestrel.com\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
  });

  it("escapes special characters according to RFC 5545", () => {
    const startTime = new Date("2026-12-10T10:00:00.000Z");
    const ics = generateIcsCalendar({
      uid: "mtg-special@leads.invalid",
      summary: "Meet, Chat; Notes & More\\Details",
      description: "Line 1\nLine 2, with comma; and semicolon.",
      startTime,
      durationMinutes: 30,
    });

    expect(ics).toContain("SUMMARY:Meet\\, Chat\\; Notes & More\\\\Details\r\n");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\, with comma\\; and semicolon.\r\n");
  });

  it("handles minimal parameters without optional fields", () => {
    const startTime = new Date("2026-12-10T10:00:00.000Z");
    const ics = generateIcsCalendar({
      uid: "mtg-min@leads.invalid",
      summary: "Quick Chat",
      startTime,
      durationMinutes: 15,
    });

    expect(ics).toContain("UID:mtg-min@leads.invalid\r\n");
    expect(ics).toContain("DTSTART:20261210T100000Z\r\n");
    expect(ics).toContain("DTEND:20261210T101500Z\r\n");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("ORGANIZER");
  });
});
