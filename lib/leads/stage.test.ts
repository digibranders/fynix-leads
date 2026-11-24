import { describe, expect, it } from "vitest";
import {
  canTransitionLead,
  isTerminalStage,
  LEAD_STAGES,
  leadStageLabel,
  leadStageTone,
} from "./stage";

describe("lead stages", () => {
  it("provides labels and tones for all stages", () => {
    for (const stage of LEAD_STAGES) {
      const label = leadStageLabel(stage);
      const tone = leadStageTone(stage);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      expect(["neutral", "pending", "approved", "rejected", "clarify", "problem"]).toContain(tone);
    }
  });

  it("identifies valid stage transitions", () => {
    expect(canTransitionLead("awaiting_client", "scheduled")).toBe(true);
    expect(canTransitionLead("awaiting_client", "declined")).toBe(true);
    expect(canTransitionLead("scheduled", "held")).toBe(true);
    expect(canTransitionLead("delivered", "disputed")).toBe(true);
    expect(canTransitionLead("disputed", "rejected")).toBe(true);
    expect(canTransitionLead("disputed", "delivered")).toBe(true);
  });

  it("follows the phase 4 flow: drafts, withdrawing, contesting and losing", () => {
    expect(canTransitionLead("draft", "awaiting_client")).toBe(true);
    expect(canTransitionLead("draft", "withdrawn")).toBe(true);
    expect(canTransitionLead("draft", "scheduled")).toBe(false);
    expect(canTransitionLead("awaiting_client", "withdrawn")).toBe(true);
    expect(canTransitionLead("scheduled", "withdrawn")).toBe(true);
    expect(canTransitionLead("awaiting_decision", "outcome_contested")).toBe(true);
    expect(canTransitionLead("client_no_show", "outcome_contested")).toBe(true);
    expect(canTransitionLead("prospect_no_show", "outcome_contested")).toBe(true);
    expect(canTransitionLead("outcome_contested", "awaiting_decision")).toBe(true);
    expect(canTransitionLead("outcome_contested", "client_no_show")).toBe(true);
    expect(canTransitionLead("outcome_contested", "prospect_no_show")).toBe(true);
    expect(canTransitionLead("outcome_contested", "accepted")).toBe(false);
    expect(canTransitionLead("accepted", "outcome_contested")).toBe(false);
    expect(canTransitionLead("withdrawn", "awaiting_client")).toBe(false);
    expect(leadStageLabel("outcome_contested")).toBe("Outcome contested");
  });

  it("follows the client-decides flow", () => {
    expect(canTransitionLead("scheduled", "declined")).toBe(true);
    expect(canTransitionLead("scheduled", "awaiting_decision")).toBe(true);
    expect(canTransitionLead("awaiting_decision", "accepted")).toBe(true);
    expect(canTransitionLead("awaiting_decision", "rejected")).toBe(true);
    expect(canTransitionLead("rejected", "accepted")).toBe(true);
    expect(canTransitionLead("awaiting_client", "accepted")).toBe(false);
    expect(canTransitionLead("scheduled", "accepted")).toBe(false);
    expect(canTransitionLead("accepted", "rejected")).toBe(false);
  });

  it("reads the old counted stage as Accepted", () => {
    expect(leadStageLabel("delivered")).toBe("Accepted");
    expect(leadStageLabel("accepted")).toBe("Accepted");
  });

  it("refuses invalid stage transitions", () => {
    expect(canTransitionLead("draft", "delivered")).toBe(false);
    expect(canTransitionLead("declined", "awaiting_client")).toBe(false);
    expect(canTransitionLead("rejected", "scheduled")).toBe(false);
  });

  it("detects terminal stages", () => {
    expect(isTerminalStage("declined")).toBe(true);
    expect(isTerminalStage("rejected")).toBe(true);
    expect(isTerminalStage("lost")).toBe(true);
    expect(isTerminalStage("withdrawn")).toBe(true);
    expect(isTerminalStage("awaiting_client")).toBe(false);
    expect(isTerminalStage("scheduled")).toBe(false);
    expect(isTerminalStage("delivered")).toBe(false);
  });
});
