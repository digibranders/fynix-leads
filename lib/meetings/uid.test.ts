import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/email/ics";
import { generateIcsCalendar } from "./ics";
import { meetingUid } from "./uid";

describe("meetingUid", () => {
  it("is the reference in lower case at the neutral domain, and names nobody", () => {
    expect(meetingUid("MTG-3F7K")).toBe("mtg-3f7k@leads.invalid");
    expect(meetingUid("MTG-3F7K")).not.toMatch(/fynix/i);
  });

  it("is the id in both the emailed file and the browser file, so a calendar treats them as one event", () => {
    const startsAt = new Date("2026-12-10T14:30:00Z");
    const emailed = buildIcs({ meetingRef: "MTG-3F7K", sequence: 0, method: "REQUEST", startsAt, endsAt: new Date("2026-12-10T15:00:00Z"), summary: "Call", location: null, organiser: { address: "a@b.example", name: "A" }, attendee: "c@d.example", stamp: startsAt });
    const browser = generateIcsCalendar({ uid: meetingUid("MTG-3F7K"), summary: "Call", startTime: startsAt, durationMinutes: 30 });
    expect(emailed).toContain("UID:mtg-3f7k@leads.invalid\r\n");
    expect(browser).toContain("UID:mtg-3f7k@leads.invalid\r\n");
    expect(browser).not.toMatch(/fynix/i);
  });
});
