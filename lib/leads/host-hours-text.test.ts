import { describe, expect, it } from "vitest";
import { describeHostHours } from "./host-hours-text";

describe("describeHostHours", () => {
  it("groups days with the same hours and names runs", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));
    expect(describeHostHours(week)).toEqual(["Mon to Fri 9:00 am to 5:00 pm"]);
  });
  it("lists separate hours on their own lines and two days with a comma", () => {
    expect(describeHostHours([{ weekday: 1, startMinute: 540, endMinute: 780 }, { weekday: 3, startMinute: 540, endMinute: 780 }, { weekday: 6, startMinute: 600, endMinute: 720 }])).toEqual(["Mon, Wed 9:00 am to 1:00 pm", "Sat 10:00 am to 12:00 pm"]);
  });
  it("reads midnight and noon, and is empty with no hours", () => {
    expect(describeHostHours([{ weekday: 0, startMinute: 0, endMinute: 1440 }])).toEqual(["Sun 12:00 am to 12:00 am"]);
    expect(describeHostHours([])).toEqual([]);
  });
});
