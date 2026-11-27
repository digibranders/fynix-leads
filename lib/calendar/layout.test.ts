import { describe, expect, it } from "vitest";
import { bookedRuns, meetingsOnDay, type CalendarPersonLike } from "./layout";

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));
const person = (over: Partial<CalendarPersonLike> = {}): CalendarPersonLike => ({ memberId: "a", displayName: "Anna", timeZone: "Europe/London", hours: week, busy: [], ...over });
const busy = (from: string, to: string) => ({ start: from, end: to });

describe("bookedRuns", () => {
  it("draws only the time that is taken, merged, and nothing for free time or working hours", () => {
    const runs = bookedRuns(person({ busy: [busy("2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z"), busy("2026-12-03T13:00:00Z", "2026-12-03T13:30:00Z"), busy("2026-12-03T16:00:00Z", "2026-12-03T16:15:00Z")] }), "2026-12-03", "Europe/London");
    expect(runs).toEqual([
      { fromMinute: 720, toMinute: 810 },
      { fromMinute: 960, toMinute: 990 },
    ]);
  });

  it("has nothing for a person with no booked time", () => {
    expect(bookedRuns(person(), "2026-12-03", "Europe/London")).toEqual([]);
  });

  it("lays booked time out in the viewer's own zone, over the whole day", () => {
    // 12:00 to 13:00 UTC is 17:30 to 18:30 in India.
    expect(bookedRuns(person({ busy: [busy("2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z")] }), "2026-12-03", "Asia/Kolkata")).toEqual([{ fromMinute: 1050, toMinute: 1110 }]);
    // 23:00 UTC is 04:30 the next day in India, so it is on the next day's grid.
    expect(bookedRuns(person({ busy: [busy("2026-12-03T23:00:00Z", "2026-12-03T23:30:00Z")] }), "2026-12-04", "Asia/Kolkata")).toEqual([{ fromMinute: 270, toMinute: 300 }]);
  });
});

describe("meetingsOnDay", () => {
  const meetings = [
    { id: "2", start: "2026-12-03T15:00:00Z" },
    { id: "1", start: "2026-12-03T09:00:00Z" },
    { id: "3", start: "2026-12-03T23:30:00Z" },
  ];

  it("keeps the meetings that fall on a day in the viewer's zone, earliest first", () => {
    expect(meetingsOnDay(meetings, "2026-12-03", "Europe/London").map((meeting) => meeting.id)).toEqual(["1", "2", "3"]);
    expect(meetingsOnDay(meetings, "2026-12-04", "Asia/Kolkata").map((meeting) => meeting.id)).toEqual(["3"]);
  });
});
