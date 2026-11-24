import { describe, expect, it } from "vitest";
import { LEAD_STAGES } from "@/lib/leads/stage";
import { leadStageLabel } from "@/lib/leads/stage";
import { LEAD } from "./status-chip";

describe("lead stage chips", () => {
  it("covers every lead stage with a word", () => {
    for (const stage of LEAD_STAGES) {
      expect(LEAD[stage], stage).toBeDefined();
      expect(LEAD[stage].label.length, stage).toBeGreaterThan(0);
    }
  });

  it("uses the same words as the domain stage labels", () => {
    for (const stage of LEAD_STAGES) expect(LEAD[stage].label, stage).toBe(leadStageLabel(stage));
  });
});
