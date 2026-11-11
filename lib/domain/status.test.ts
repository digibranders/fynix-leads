import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUSES,
  MEETING_STATUSES,
  approvalLabel,
  approvalTone,
  meetingLabel,
  meetingTone,
} from "./status";

describe("status vocabulary", () => {
  it("labels every approval status in sentence case", () => {
    for (const s of APPROVAL_STATUSES) {
      const label = approvalLabel(s);
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  it("labels every meeting status", () => {
    for (const s of MEETING_STATUSES) expect(meetingLabel(s).length).toBeGreaterThan(0);
  });

  it("gives each approval outcome its own tone", () => {
    expect(approvalTone("pending")).toBe("pending");
    expect(approvalTone("approved")).toBe("approved");
    expect(approvalTone("rejected")).toBe("rejected");
    expect(approvalTone("needs_clarification")).toBe("clarify");
    expect(approvalTone("draft")).toBe("neutral");
  });

  it("tints only the meeting outcomes that went wrong", () => {
    const problems = MEETING_STATUSES.filter((s) => meetingTone(s) === "problem");
    expect(problems).toEqual(["prospect_no_show", "client_no_show", "prospect_declined", "cancelled"]);
  });
});
