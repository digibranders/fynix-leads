import { describe, expect, it } from "vitest";
import { availableActions, type LeadActionFacts, type LeadViewer } from "./lead-actions";

const of = (viewer: LeadViewer, stage: string, meetingPassed = false, facts: LeadActionFacts = {}) => availableActions({ viewer, stage, meetingPassed, ...facts });

describe("availableActions, the client", () => {
  it("lets the client pick, propose or reject while it waits for a time", () => {
    expect(of("client", "awaiting_client")).toEqual(["pick_time", "propose_times", "reject"]);
  });
  it("lets the client reject and propose new times on a booked meeting, and record the outcome once its time has passed", () => {
    expect(of("client", "scheduled")).toEqual(["reject", "postpone"]);
    expect(of("client", "scheduled", true)).toEqual(["reject", "record_outcome"]);
  });
  it("offers a pick when the supply side proposed new times, and not when the client did", () => {
    expect(of("client", "scheduled", false, { openProposalBy: "supply" })).toEqual(["reject", "postpone", "pick_new_time"]);
    expect(of("client", "scheduled", false, { openProposalBy: "client" })).toEqual(["reject", "postpone"]);
  });
  it("asks the client to accept or reject after the meeting was held, and lets it contest an outcome", () => {
    expect(of("client", "awaiting_decision")).toEqual(["decide"]);
    expect(of("client", "awaiting_decision", true, { canContest: true })).toEqual(["decide", "contest"]);
    expect(of("client", "client_no_show", true, { canContest: true })).toEqual(["contest"]);
  });
  it("never offers the client a withdrawal or a review request", () => {
    expect(of("client", "scheduled", false, { isSource: true, isCoordinator: true })).not.toContain("withdraw");
    expect(of("client", "rejected", true, { isCoordinator: true, canAskReview: true })).toEqual([]);
  });
});

describe("availableActions, the supply side", () => {
  it("offers the outcome only after the meeting time", () => {
    expect(of("supply", "scheduled", true)).toEqual(["record_outcome"]);
    expect(of("supply", "outcome_due")).toEqual(["record_outcome"]);
  });
  it("lets the source withdraw before the meeting and nobody else", () => {
    expect(of("supply", "awaiting_client", false, { isSource: true })).toEqual(["withdraw"]);
    expect(of("supply", "awaiting_client")).toEqual([]);
    expect(of("supply", "scheduled", false, { isSource: true })).toEqual(["postpone", "withdraw"]);
    expect(of("supply", "scheduled", false, { isSource: false })).toEqual(["postpone"]);
    expect(of("supply", "scheduled", true, { isSource: true })).toEqual(["record_outcome"]);
  });
  it("offers a pick when the client proposed new times", () => {
    expect(of("supply", "scheduled", false, { openProposalBy: "client" })).toEqual(["postpone", "pick_new_time"]);
    expect(of("supply", "scheduled", false, { openProposalBy: "supply" })).toEqual(["postpone"]);
  });
  it("lets the other side contest a recorded outcome", () => {
    expect(of("supply", "awaiting_decision", true, { canContest: true })).toEqual(["contest"]);
    expect(of("supply", "awaiting_decision", true)).toEqual([]);
  });
  it("lets only the coordinator ask for a review of a rejection, inside the window", () => {
    expect(of("supply", "rejected", true, { isCoordinator: true, canAskReview: true })).toEqual(["ask_review"]);
    expect(of("supply", "rejected", true, { isCoordinator: false, canAskReview: true })).toEqual([]);
    expect(of("supply", "rejected", true, { isCoordinator: true, canAskReview: false })).toEqual([]);
    expect(of("supply", "accepted", true, { isCoordinator: true, canAskReview: true })).toEqual([]);
  });
});

describe("availableActions, Fynix", () => {
  it("records the outcome after the time, overturns or reviews a rejection, and decides a contest", () => {
    expect(of("fynix", "scheduled", true)).toEqual(["record_outcome", "answer_for_client", "correct", "mark_lost"]);
    expect(of("fynix", "rejected")).toEqual(["overturn", "mark_reviewed", "correct"]);
    expect(of("fynix", "rejected", false, { reviewed: true })).toEqual(["overturn", "correct"]);
    expect(of("fynix", "outcome_contested")).toEqual(["decide_contest", "correct", "mark_lost"]);
  });
  it("answers for the client while a time or a decision is waiting, and marks a lead lost from an open stage only", () => {
    expect(of("fynix", "awaiting_client")).toEqual(["answer_for_client", "correct", "mark_lost"]);
    expect(of("fynix", "awaiting_decision")).toEqual(["answer_for_client", "correct", "mark_lost"]);
    expect(of("fynix", "accepted")).toEqual(["correct"]);
  });
  it("clears a beyond-a-share flag only when it is set", () => {
    expect(of("fynix", "awaiting_client", false, { overShare: true })).toContain("clear_over_share");
    expect(of("fynix", "awaiting_client")).not.toContain("clear_over_share");
  });
  it("offers nothing on a draft and no postponing, withdrawing or contesting", () => {
    expect(of("fynix", "draft", false, { overShare: true, isSource: true, canContest: true })).toEqual([]);
    expect(of("fynix", "scheduled")).not.toContain("postpone");
  });
});

describe("availableActions, closed leads", () => {
  it("offers the client and the supply side nothing on a counted or closed lead", () => {
    for (const stage of ["accepted", "declined", "prospect_no_show", "client_no_show", "withdrawn", "lost"]) {
      for (const viewer of ["client", "supply"] as const) expect(of(viewer, stage, true, { isSource: true, isCoordinator: true }), `${viewer} ${stage}`).toEqual([]);
    }
  });
});
