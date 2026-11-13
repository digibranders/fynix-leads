import { describe, expect, it } from "vitest";
import { parseBlockForm } from "@/lib/fynix/block-form";

const form = (entries: Record<string, string>, zone = "Europe/London") => parseBlockForm((name) => entries[name] ?? "", zone);

describe("parseBlockForm", () => {
  it("reads a part of a day in the host's zone", () => {
    expect(form({ date: "2026-11-26", start: "14:00", end: "16:00" })).toEqual({ startsAt: "2026-11-26T14:00:00.000Z", endsAt: "2026-11-26T16:00:00.000Z", errors: {} });
    expect(form({ date: "2026-11-26", start: "14:00", end: "16:00" }, "Asia/Kolkata")).toMatchObject({ startsAt: "2026-11-26T08:30:00.000Z", endsAt: "2026-11-26T10:30:00.000Z" });
  });

  it("makes an all day block run to the next midnight of the last day", () => {
    expect(form({ date: "2026-11-23", allDay: "on" })).toMatchObject({ startsAt: "2026-11-23T00:00:00.000Z", endsAt: "2026-11-24T00:00:00.000Z" });
    expect(form({ date: "2026-11-23", endDate: "2026-11-25", allDay: "on", start: "garbage" })).toMatchObject({ startsAt: "2026-11-23T00:00:00.000Z", endsAt: "2026-11-26T00:00:00.000Z" });
  });

  it("reads a run of days with times", () => {
    expect(form({ date: "2026-11-23", endDate: "2026-11-24", start: "09:00", end: "17:00" })).toMatchObject({ startsAt: "2026-11-23T09:00:00.000Z", endsAt: "2026-11-24T17:00:00.000Z" });
  });

  it("says what is wrong with each field", () => {
    expect(form({ date: "" }).errors).toEqual({ date: "Choose the day." });
    expect(form({ date: "2026-11-23", endDate: "nope" }).errors).toEqual({ endDate: "Choose the last day, or leave it empty." });
    expect(form({ date: "2026-11-23", endDate: "2026-11-22" }).errors).toEqual({ endDate: "The last day must not be before the first day." });
    expect(form({ date: "2026-11-23", start: "", end: "" }).errors).toEqual({ start: "Choose a start time.", end: "Choose an end time." });
    expect(form({ date: "2026-11-23", start: "16:00", end: "14:00" }).errors).toEqual({ end: "The end must be after the start." });
    expect(form({ date: "2026-11-23", start: "14:00", end: "14:00" }).errors).toEqual({ end: "The end must be after the start." });
  });

  it("refuses a time the zone skips", () => {
    const result = form({ date: "2027-03-28", start: "01:30", end: "03:00" });
    expect(result.startsAt).toBeNull();
    expect(result.errors).toEqual({ start: "That time does not exist on that day, because the clocks change." });
  });
});
