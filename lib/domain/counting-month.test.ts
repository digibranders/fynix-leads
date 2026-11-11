import { describe, expect, it } from "vitest";
import type { ApprovalStatus, MeetingStatus } from "./status";
import { countingMonth } from "./counting-month";

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
