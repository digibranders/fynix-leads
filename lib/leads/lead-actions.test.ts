import { describe, expect, it } from "vitest";
import { availableActions, type LeadViewer } from "./lead-actions";

const of = (viewer: LeadViewer, stage: string, meetingPassed = false) => availableActions({ viewer, stage, meetingPassed });

describe("availableActions", () => {
  it("lets the client pick, propose or reject while it waits for a time", () => {
    expect(of("client", "awaiting_client")).toEqual(["pick_time", "propose_times", "reject"]);
  });

  it("lets the client reject a booked meeting, and record the outcome once its time has passed", () => {
    expect(of("client", "scheduled")).toEqual(["reject"]);
    expect(of("client", "scheduled", true)).toEqual(["reject", "record_outcome"]);
  });

  it("asks the client to accept or reject after the meeting was held", () => {
    expect(of("client", "awaiting_decision")).toEqual(["decide"]);
  });

  it("offers the supply side only the outcome, and only after the meeting time", () => {
    expect(of("supply", "scheduled")).toEqual([]);
    expect(of("supply", "scheduled", true)).toEqual(["record_outcome"]);
    expect(of("supply", "outcome_due")).toEqual(["record_outcome"]);
    expect(of("supply", "awaiting_client")).toEqual([]);
    expect(of("supply", "rejected")).toEqual([]);
  });

  it("lets Fynix record the outcome and overturn a rejection, nothing else", () => {
    expect(of("fynix", "scheduled", true)).toEqual(["record_outcome"]);
    expect(of("fynix", "rejected")).toEqual(["overturn"]);
    expect(of("fynix", "awaiting_client")).toEqual([]);
    expect(of("fynix", "awaiting_decision")).toEqual([]);
  });

  it("offers nothing on a closed or counted lead", () => {
    for (const stage of ["accepted", "declined", "prospect_no_show", "client_no_show", "withdrawn", "lost"]) {
      for (const viewer of ["client", "supply", "fynix"] as const) expect(of(viewer, stage, true), `${viewer} ${stage}`).toEqual([]);
    }
  });
});
