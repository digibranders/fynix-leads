import { describe, expect, it } from "vitest";
import { isDelivered } from "./delivered";

describe("isDelivered", () => {
  it("is true only when approved and a meeting is completed", () => {
    expect(isDelivered({ approval: "approved", meetings: [{ status: "completed" }] })).toBe(true);
  });

  it("is false when approved but no meeting has completed", () => {
    expect(isDelivered({ approval: "approved", meetings: [{ status: "scheduled" }] })).toBe(false);
    expect(isDelivered({ approval: "approved", meetings: [] })).toBe(false);
  });

  it("is false when the meeting completed but the client has not approved", () => {
    expect(isDelivered({ approval: "pending", meetings: [{ status: "completed" }] })).toBe(false);
    expect(isDelivered({ approval: "rejected", meetings: [{ status: "completed" }] })).toBe(false);
  });

  it("counts a lead with an earlier no-show and a later completed meeting", () => {
    expect(
      isDelivered({ approval: "approved", meetings: [{ status: "prospect_no_show" }, { status: "completed" }] }),
    ).toBe(true);
  });
});
