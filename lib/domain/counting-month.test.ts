import { describe, expect, it } from "vitest";
import type { ApprovalStatus, MeetingStatus } from "./status";
import { COUNTED_STAGES, countedMonth, countingMonth, isCountedStage, lateRejectionCounts } from "./counting-month";

const UTC = "UTC";
const LONDON = "Europe/London";

const lead = (approval: ApprovalStatus, meetings: { status: MeetingStatus; startsAt: string }[]) => ({ approval, meetings });

describe("countingMonth", () => {
  it("is the UTC month of the completed meeting for a delivered lead", () => {
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-11-05T10:00:00Z" }]), UTC)).toBe("2026-11");
  });

  it("uses the earliest completed meeting", () => {
    expect(
      countingMonth(
        lead("approved", [
          { status: "completed", startsAt: "2026-11-02T10:00:00Z" },
          { status: "completed", startsAt: "2026-10-28T10:00:00Z" },
          { status: "scheduled", startsAt: "2026-09-01T10:00:00Z" },
        ]),
        UTC,
      ),
    ).toBe("2026-10");
  });

  it("reads the month in the zone it is given", () => {
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-10-31T23:30:00Z" }]), UTC)).toBe("2026-10");
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-11-01T00:30:00Z" }]), UTC)).toBe("2026-11");
  });

  it("counts a meeting in the campaign month when UTC and London disagree (BST)", () => {
    // 31 Jul 23:30Z is 1 Aug 00:30 in London.
    const l = lead("approved", [{ status: "completed", startsAt: "2026-07-31T23:30:00Z" }]);
    expect(countingMonth(l, UTC)).toBe("2026-07");
    expect(countingMonth(l, LONDON)).toBe("2026-08");
  });

  it("ignores an old cancelled meeting and a later scheduled one", () => {
    expect(
      countingMonth(
        lead("approved", [
          { status: "cancelled", startsAt: "2026-08-02T10:00:00Z" },
          { status: "completed", startsAt: "2026-10-05T10:00:00Z" },
        ]),
        UTC,
      ),
    ).toBe("2026-10");
  });

  it("is null when the lead is not delivered", () => {
    expect(countingMonth(lead("pending", [{ status: "completed", startsAt: "2026-11-05T10:00:00Z" }]), UTC)).toBeNull();
    expect(countingMonth(lead("approved", [{ status: "scheduled", startsAt: "2026-11-15T10:00:00Z" }]), UTC)).toBeNull();
    expect(countingMonth(lead("approved", []), UTC)).toBeNull();
  });
});

describe("countedMonth", () => {
  it("reads the month in the campaign time zone across a month boundary", () => {
    const lateOctober = new Date("2026-10-31T23:30:00Z");
    expect(countedMonth(lateOctober, "UTC")).toBe("2026-10");
    expect(countedMonth(lateOctober, "Europe/London")).toBe("2026-10");
    expect(countedMonth(lateOctober, "Asia/Kolkata")).toBe("2026-11");
    expect(countedMonth(lateOctober, "America/Los_Angeles")).toBe("2026-10");
  });

  it("follows daylight saving time at the edge of a month", () => {
    // London is on BST (UTC+1) until 25 October 2026 and on GMT after it; Europe/London reads 1 am on 1 November as GMT.
    expect(countedMonth(new Date("2026-09-30T23:30:00Z"), "Europe/London")).toBe("2026-10");
    expect(countedMonth(new Date("2026-10-31T23:59:00Z"), "Europe/London")).toBe("2026-10");
    expect(countedMonth(new Date("2026-11-01T00:00:00Z"), "Europe/London")).toBe("2026-11");
    // New York ends daylight saving on 1 November 2026: 04:30 UTC is 00:30 EDT on the 1st, 03:30 UTC is 23:30 EDT on 31 October.
    expect(countedMonth(new Date("2026-11-01T03:30:00Z"), "America/New_York")).toBe("2026-10");
    expect(countedMonth(new Date("2026-11-01T04:30:00Z"), "America/New_York")).toBe("2026-11");
    // The spring change: 31 March 2026 at 23:30 UTC is already 1 April in London (BST).
    expect(countedMonth(new Date("2026-03-31T23:30:00Z"), "Europe/London")).toBe("2026-04");
  });
});

describe("which stages count", () => {
  it("counts accepted, the old delivered and a client no-show, and nothing else", () => {
    expect([...COUNTED_STAGES].sort()).toEqual(["accepted", "client_no_show", "delivered"]);
    for (const stage of ["accepted", "delivered", "client_no_show"]) expect(isCountedStage(stage), stage).toBe(true);
    for (const stage of ["awaiting_client", "scheduled", "awaiting_decision", "rejected", "declined", "prospect_no_show", "disputed", "draft"]) expect(isCountedStage(stage), stage).toBe(false);
  });
});

describe("lateRejectionCounts", () => {
  it("counts zero for a rejection inside the last 24 hours, like any early rejection, until the owner decides", () => {
    const meeting = new Date("2026-11-30T10:00:00Z");
    expect(lateRejectionCounts(meeting, new Date("2026-11-30T09:00:00Z"))).toBe(false);
    expect(lateRejectionCounts(meeting, new Date("2026-11-29T10:00:01Z"))).toBe(false);
    expect(lateRejectionCounts(meeting, new Date("2026-11-20T10:00:00Z"))).toBe(false);
  });
});
