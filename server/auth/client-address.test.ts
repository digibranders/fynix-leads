import { describe, expect, it } from "vitest";
import { clientAddressFrom } from "./client-address";

describe("clientAddressFrom", () => {
  it("reads x-real-ip", () => {
    expect(clientAddressFrom(new Headers({ "x-real-ip": " 203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("ignores x-forwarded-for, which a client can set to anything", () => {
    expect(clientAddressFrom(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to one shared bucket when the header is missing, empty or too long to be an address", () => {
    expect(clientAddressFrom(new Headers())).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-real-ip": "   " }))).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-real-ip": "9".repeat(65) }))).toBe("unknown");
  });
});
