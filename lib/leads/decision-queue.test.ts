import { describe, expect, it } from "vitest";
import { autoAcceptCountdown, clientQueueCount } from "./decision-queue";

const recorded = new Date("2026-11-24T10:00:00Z");
const after = (hours: number) => new Date(recorded.getTime() + hours * 3_600_000);

describe("autoAcceptCountdown", () => {
  it("counts the 48 hours from the outcome", () => {
    expect(autoAcceptCountdown(recorded, after(17)).label).toBe("Accepted automatically in 31h");
    expect(autoAcceptCountdown(recorded, after(0)).hoursLeft).toBe(48);
  });

  it("rounds a part hour up so the lead never reads as already accepted", () => {
    expect(autoAcceptCountdown(recorded, new Date(after(46).getTime() + 60_000)).label).toBe("Accepted automatically in 2h");
  });

  it("is urgent from the last day", () => {
    expect(autoAcceptCountdown(recorded, after(23)).urgent).toBe(false);
    expect(autoAcceptCountdown(recorded, after(24)).urgent).toBe(true);
  });

  it("never goes negative once the time has passed", () => {
    const late = autoAcceptCountdown(recorded, after(50));
    expect(late.hoursLeft).toBe(0);
    expect(late.label).toContain("next check");
  });
});

describe("clientQueueCount", () => {
  it("adds the time queue and the decision queue", () => {
    expect(clientQueueCount([{ stage: "awaiting_client" }, { stage: "awaiting_decision" }, { stage: "scheduled" }, { stage: "accepted" }])).toBe(2);
  });
});
