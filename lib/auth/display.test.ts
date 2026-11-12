import { describe, expect, it } from "vitest";
import { KIND_LABEL, initialsOf } from "@/lib/auth/display";

describe("initialsOf", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initialsOf("Meera Joshi")).toBe("MJ");
    expect(initialsOf("  amara   chinwe okonkwo ")).toBe("AO");
  });
  it("copes with one word and with nothing", () => {
    expect(initialsOf("Tomas")).toBe("T");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("KIND_LABEL", () => {
  it("has one plain word per kind", () => {
    expect(KIND_LABEL).toEqual({ fynix: "Fynix", client: "Client", agency: "Agency" });
  });
});
