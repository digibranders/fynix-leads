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
