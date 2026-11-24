import { describe, expect, it } from "vitest";
import { LEAD_STAGES } from "./stage";
import { countByGroup, groupOf, inGroup, parseGroup, PIPELINE_GROUPS } from "./pipeline";

describe("pipeline groups", () => {
  it("puts every lead stage in exactly one group", () => {
    for (const stage of LEAD_STAGES) {
      const homes = PIPELINE_GROUPS.filter((group) => (group.stages as readonly string[]).includes(stage));
      expect(homes, stage).toHaveLength(1);
      expect(groupOf(stage)).toBe(homes[0]?.key);
    }
  });

  it("counts by group and keeps empty groups at zero", () => {
    const counts = countByGroup([{ stage: "awaiting_client" }, { stage: "awaiting_client" }, { stage: "prospect_no_show" }, { stage: "awaiting_decision" }, { stage: "client_no_show" }, { stage: "unknown_stage" }]);
    expect(counts.awaiting).toBe(2);
    expect(counts.closed).toBe(1);
    expect(counts.decision).toBe(1);
    expect(counts.delivered).toBe(1);
    expect(counts.disputed).toBe(0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("gives a contested outcome its own group, apart from the ones that count or wait for the client", () => {
    expect(groupOf("outcome_contested")).toBe("contested");
    expect(countByGroup([{ stage: "outcome_contested" }]).contested).toBe(1);
    expect(parseGroup("contested")).toBe("contested");
  });

  it("filters to a group, or returns everything for null", () => {
    const leads = [{ stage: "scheduled" }, { stage: "reschedule_needed" }, { stage: "delivered" }];
    expect(inGroup(leads, "scheduled")).toHaveLength(2);
    expect(inGroup(leads, null)).toHaveLength(3);
  });

  it("reads only known group keys from the URL", () => {
    expect(parseGroup("due")).toBe("due");
    expect(parseGroup(["delivered", "x"])).toBe("delivered");
    expect(parseGroup("<script>")).toBeNull();
    expect(parseGroup(undefined)).toBeNull();
  });
});
