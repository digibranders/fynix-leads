import { describe, expect, it } from "vitest";
import type { MeetingStatus } from "./status";
import { primaryMeeting } from "./primary-meeting";

const m = (id: string, status: MeetingStatus, startsAt: string) => ({ id, status, startsAt, repName: "Rep" });

describe("primaryMeeting", () => {
  it("is undefined without meetings", () => expect(primaryMeeting([])).toBeUndefined());

  it("prefers the earliest completed meeting", () => {
    const list = [m("a", "scheduled", "2026-11-20T10:00:00Z"), m("b", "completed", "2026-11-05T10:00:00Z"), m("c", "completed", "2026-11-03T10:00:00Z")];
    expect(primaryMeeting(list)?.id).toBe("c");
  });

  it("otherwise takes the most recently added meeting", () => {
    const list = [m("a", "cancelled", "2026-11-02T10:00:00Z"), m("b", "scheduled", "2026-11-20T10:00:00Z")];
    expect(primaryMeeting(list)?.id).toBe("b");
  });

  it("shows the completed meeting even when an old cancelled one was added first", () => {
    const list = [m("old", "cancelled", "2026-08-02T10:00:00Z"), m("done", "completed", "2026-10-05T10:00:00Z")];
    expect(primaryMeeting(list)?.id).toBe("done");
  });

  it("keeps the shape of the meetings it is given", () => {
    expect(primaryMeeting([m("a", "completed", "2026-11-05T10:00:00Z")])?.repName).toBe("Rep");
  });
});
