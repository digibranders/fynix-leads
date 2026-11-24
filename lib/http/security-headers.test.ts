import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

describe("SECURITY_HEADERS", () => {
  const byKey = new Map(SECURITY_HEADERS.map((header) => [header.key, header.value]));

  it("stops the app being framed", () => {
    expect(byKey.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
  });

  it("stops type sniffing and sets a referrer and transport policy", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Strict-Transport-Security")).toMatch(/^max-age=\d+$/);
  });

  it("names every header once", () => {
    expect(byKey.size).toBe(SECURITY_HEADERS.length);
  });
});
