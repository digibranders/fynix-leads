import { describe, expect, it } from "vitest";
import type { ApprovalStatus, MeetingStatus } from "./status";
import { countingMonth } from "./counting-month";

const lead = (approval: ApprovalStatus, meetings: { status: MeetingStatus; startsAt: string }[]) => ({ approval, meetings });

describe("countingMonth", () => {
  it("is the UTC month of the completed meeting for a delivered lead", () => {
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-11-05T10:00:00Z" }]))).toBe("2026-11");
  });

  it("uses the earliest completed meeting", () => {
    expect(
      countingMonth(
        lead("approved", [
          { status: "completed", startsAt: "2026-11-02T10:00:00Z" },
          { status: "completed", startsAt: "2026-10-28T10:00:00Z" },
          { status: "scheduled", startsAt: "2026-09-01T10:00:00Z" },
        ]),
      ),
    ).toBe("2026-10");
  });

  it("reads the UTC month, not the local one", () => {
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-10-31T23:30:00Z" }]))).toBe("2026-10");
    expect(countingMonth(lead("approved", [{ status: "completed", startsAt: "2026-11-01T00:30:00Z" }]))).toBe("2026-11");
  });

  it("is null when the lead is not delivered", () => {
    expect(countingMonth(lead("pending", [{ status: "completed", startsAt: "2026-11-05T10:00:00Z" }]))).toBeNull();
    expect(countingMonth(lead("approved", [{ status: "scheduled", startsAt: "2026-11-15T10:00:00Z" }]))).toBeNull();
    expect(countingMonth(lead("approved", []))).toBeNull();
  });
});
