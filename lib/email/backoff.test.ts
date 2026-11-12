import { describe, expect, it } from "vitest";
import { CLAIM_LEASE_SECONDS, LINK_RETENTION_SECONDS, MAX_SEND_ATTEMPTS, retryDelaySeconds } from "./backoff";

describe("retryDelaySeconds", () => {
  it("waits longer after each failure", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([60, 300, 1800, 7200]);
  });

  it("gives up after the last attempt", () => {
    expect(MAX_SEND_ATTEMPTS).toBe(5);
    expect(retryDelaySeconds(5)).toBeNull();
    expect(retryDelaySeconds(6)).toBeNull();
  });

  it("refuses a count that is not a whole number from 1", () => {
    expect(() => retryDelaySeconds(0)).toThrow(RangeError);
    expect(() => retryDelaySeconds(1.5)).toThrow(RangeError);
  });

  it("keeps a lease longer than the longest provider timeout and a link for exactly a day", () => {
    expect(CLAIM_LEASE_SECONDS).toBeGreaterThanOrEqual(600);
    expect(LINK_RETENTION_SECONDS).toBe(86_400);
  });
});
