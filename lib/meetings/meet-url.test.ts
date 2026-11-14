import { describe, expect, it } from "vitest";
import { generateGoogleMeetUrl, isValidGoogleMeetUrl } from "./meet-url";

describe("generateGoogleMeetUrl", () => {
  it("generates a valid google meet url with xxx-yyyy-zzz pattern", () => {
    // 0 -> a, 1 -> b, 2 -> c, 3 -> d, 4 -> e, 5 -> f, 6 -> g, 7 -> h, 8 -> i, 9 -> j
    const mockBytes = () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const url = generateGoogleMeetUrl(mockBytes);
    expect(url).toBe("https://meet.google.com/abc-defg-hij");
    expect(isValidGoogleMeetUrl(url)).toBe(true);
  });

  it("handles wrap around in the alphabet", () => {
    const mockBytes = () => Uint8Array.from([25, 26, 27, 28, 29, 30, 31, 32, 33, 34]);
    // 25 % 26 = 25 (z), 26 % 26 = 0 (a), 27 % 26 = 1 (b), ...
    const url = generateGoogleMeetUrl(mockBytes);
    expect(url).toBe("https://meet.google.com/zab-cdef-ghi");
    expect(isValidGoogleMeetUrl(url)).toBe(true);
  });

  it("throws RangeError if random source returns fewer than 10 bytes", () => {
    const insufficientBytes = () => Uint8Array.from([1, 2, 3]);
    expect(() => generateGoogleMeetUrl(insufficientBytes)).toThrow(RangeError);
  });
});

describe("isValidGoogleMeetUrl", () => {
  it("accepts valid google meet urls", () => {
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isValidGoogleMeetUrl("https://meet.google.com/xyz-pqrs-tuv")).toBe(true);
  });

  it("rejects invalid urls", () => {
    expect(isValidGoogleMeetUrl("http://meet.google.com/abc-defg-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("https://google.com/abc-defg-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij/")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij?authuser=0")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/ABC-DEFG-HIJ")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/ab-defg-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abcd-defg-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc-def-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hi")).toBe(false);
    expect(isValidGoogleMeetUrl("https://meet.google.com/abc1-defg-hij")).toBe(false);
    expect(isValidGoogleMeetUrl("")).toBe(false);
  });
});
