import { describe, expect, it } from "vitest";
import { isDelivered } from "@/lib/domain/delivered";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS } from "./data";

describe("sample data", () => {
  it("has unique lead refs in the LD-XXXX format", () => {
    const refs = SAMPLE_LEADS.map((l) => l.ref);
    expect(new Set(refs).size).toBe(refs.length);
    for (const r of refs) expect(r).toMatch(/^LD-[0-9A-Z]{4}$/);
  });

  it("covers every approval state the prototype shows", () => {
    const states = new Set(SAMPLE_LEADS.map((l) => l.approval));
    for (const s of ["pending", "approved", "rejected", "needs_clarification"] as const) expect(states.has(s)).toBe(true);
  });

  it("gives rejected leads a decision with a reason", () => {
    for (const l of SAMPLE_LEADS.filter((x) => x.approval === "rejected")) expect(l.decision?.reasonCode).toBeTruthy();
  });

  it("has at least one delivered lead and fewer than the monthly target", () => {
    const delivered = SAMPLE_LEADS.filter(isDelivered).length;
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(SAMPLE_CAMPAIGN.monthlyTarget);
  });

  it("contains no contact details in relayed messages", () => {
    for (const l of SAMPLE_LEADS)
      for (const m of l.thread) expect(m.body).not.toMatch(/@|https?:\/\/|\+\d/);
  });
});
