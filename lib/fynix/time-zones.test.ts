import { describe, expect, it } from "vitest";
import { isIanaTimeZone } from "@/lib/domain/campaign-settings";
import { COMMON_TIME_ZONES } from "@/lib/fynix/time-zones";

describe("COMMON_TIME_ZONES", () => {
  it("lists only zones the domain accepts, each once", () => {
    for (const zone of COMMON_TIME_ZONES) expect(isIanaTimeZone(zone), zone).toBe(true);
    expect(new Set(COMMON_TIME_ZONES).size).toBe(COMMON_TIME_ZONES.length);
  });
});
