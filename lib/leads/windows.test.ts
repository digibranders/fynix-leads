import { describe, expect, it } from "vitest";
import { contestWindow, reviewWindow, windowLeft } from "./windows";

const now = new Date("2026-11-24T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("windowLeft", () => {
  it("counts whole hours up and closes at 48", () => {
    expect(windowLeft(ago(1), 48, now)).toMatchObject({ open: true, hoursLeft: 47, label: "47h left" });
    expect(windowLeft(ago(47.5), 48, now).hoursLeft).toBe(1);
    expect(windowLeft(ago(48), 48, now)).toMatchObject({ open: false, hoursLeft: 0 });
  });
});

describe("contestWindow", () => {
  const base = { viewer: "client" as const, stage: "awaiting_decision", outcome: "held", recordedAt: ago(10), recordedByRole: "agency", contestedAt: null, now };
  it("lets the other side contest inside the window", () => {
    expect(contestWindow(base)).toMatchObject({ canContest: true, hoursLeft: 38 });
    expect(contestWindow({ ...base, viewer: "supply", recordedByRole: "client", stage: "client_no_show", outcome: "client_no_show" }).canContest).toBe(true);
  });
  it("refuses the recorder, Fynix, an outcome Fynix recorded, a second contest, a late one and a lead that moved on", () => {
    expect(contestWindow({ ...base, viewer: "supply" }).canContest).toBe(false);
    expect(contestWindow({ ...base, viewer: "fynix" }).canContest).toBe(false);
    expect(contestWindow({ ...base, recordedByRole: "fynix" }).canContest).toBe(false);
    expect(contestWindow({ ...base, contestedAt: ago(1) }).canContest).toBe(false);
    expect(contestWindow({ ...base, recordedAt: ago(49) }).canContest).toBe(false);
    expect(contestWindow({ ...base, stage: "accepted" }).canContest).toBe(false);
  });
});

describe("reviewWindow", () => {
  const base = { stage: "rejected", decisionSource: "client", decisionAt: ago(20), alreadyAsked: false, now };
  it("opens for a client rejection inside 48 hours", () => {
    expect(reviewWindow(base)).toMatchObject({ canAsk: true, hoursLeft: 28 });
  });
  it("closes when asked, late, automatic or not a rejection", () => {
    expect(reviewWindow({ ...base, alreadyAsked: true }).canAsk).toBe(false);
    expect(reviewWindow({ ...base, decisionAt: ago(50) }).canAsk).toBe(false);
    expect(reviewWindow({ ...base, decisionSource: "fynix" }).canAsk).toBe(false);
    expect(reviewWindow({ ...base, stage: "accepted" }).canAsk).toBe(false);
  });
});
