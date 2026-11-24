import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/fynix/forms/form-sheet", () => ({ FormSheet: () => null }));

const { UpcomingMeetings } = await import("./upcoming-meetings");

const base = { prospectName: "Priya Raman", prospectCompany: "Northwind Foods", scheduledStartTime: new Date("2026-12-01T10:00:00Z") };

describe("UpcomingMeetings", () => {
  it("shows a Join button when the meeting has a Meet link", () => {
    const html = renderToStaticMarkup(<UpcomingMeetings allHref="/client/meetings" emptyText="None." meetings={[{ id: "m1", googleMeetUrl: "https://meet.google.com/abc-defg-hij", ...base }]} />);
    expect(html).toContain("Join Meet");
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html).toContain("Priya Raman");
  });

  it("says the link is to follow when there is none, and never invents one", () => {
    const html = renderToStaticMarkup(<UpcomingMeetings allHref="/client/meetings" emptyText="None." meetings={[{ id: "m1", googleMeetUrl: null, ...base }]} />);
    expect(html).toContain("Meet link to follow");
    expect(html).not.toContain("Join Meet");
    expect(html).not.toContain("meet.google.com");
  });

  it("shows the empty state with its own sentence", () => {
    const html = renderToStaticMarkup(<UpcomingMeetings allHref="/agency/meetings" emptyText="When a client picks a time, the meeting shows up here." meetings={[]} />);
    expect(html).toContain("No meetings booked");
    expect(html).toContain("When a client picks a time");
  });
});
