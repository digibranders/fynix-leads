import { describe, expect, it } from "vitest";
import { summariseShares } from "@/lib/domain/share-allocation";

describe("summariseShares", () => {
  it("adds the shares and is not over-allocated at or below the coordinator's target", () => {
    expect(summariseShares(20, [8, 7, 5])).toEqual({ totalShares: 20, campaignMonthlyTarget: 20, overAllocated: false });
    expect(summariseShares(20, [3])).toEqual({ totalShares: 3, campaignMonthlyTarget: 20, overAllocated: false });
  });

  it("flags a total above the coordinator's target", () => {
    expect(summariseShares(20, [10, 11])).toEqual({ totalShares: 21, campaignMonthlyTarget: 20, overAllocated: true });
  });

  it("flags nothing when there is no coordinator target to compare with, and handles no shares", () => {
    expect(summariseShares(null, [100, 100])).toEqual({ totalShares: 200, campaignMonthlyTarget: null, overAllocated: false });
    expect(summariseShares(0, [])).toEqual({ totalShares: 0, campaignMonthlyTarget: 0, overAllocated: false });
    expect(summariseShares(0, [1])).toEqual({ totalShares: 1, campaignMonthlyTarget: 0, overAllocated: true });
  });
});
