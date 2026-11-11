import { describe, expect, it } from "vitest";
import { REJECTION_REASONS } from "./rejection-reasons";
import type { Decision } from "./types";

describe("Decision", () => {
  it("only accepts a known rejection reason code (checked by tsc)", () => {
    // @ts-expect-error "made_up" is not a RejectionReasonCode
    const bad: Decision = { outcome: "rejected", reasonCode: "made_up", decidedAt: "2026-11-11T10:00:00Z" };
    const good: Decision = { outcome: "rejected", reasonCode: REJECTION_REASONS[0].code, decidedAt: "2026-11-11T10:00:00Z" };
    expect([bad, good]).toHaveLength(2);
  });
});
