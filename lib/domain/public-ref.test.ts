import { describe, expect, it } from "vitest";
import { REF_ALPHABET, generatePublicRef, isPublicRef } from "./public-ref";

describe("generatePublicRef", () => {
  it("is the prefix, a dash and four characters of the alphabet", () => {
    const ref = generatePublicRef("CMP", () => Uint8Array.from([0, 1, 2, 255]));
    expect(ref).toBe("CMP-012Z");
    expect(isPublicRef(ref, "CMP")).toBe(true);
  });

  it("uses all 32 characters and none of I, L, O or U", () => {
    expect(REF_ALPHABET).toHaveLength(32);
    expect(new Set(REF_ALPHABET).size).toBe(32);
    for (const letter of "ILOU") expect(REF_ALPHABET).not.toContain(letter);
    const seen = new Set<string>();
    for (let byte = 0; byte < 256; byte += 4) {
      generatePublicRef("ORG", () => Uint8Array.from([byte, byte + 1, byte + 2, byte + 3])).slice(4).split("").forEach((character) => seen.add(character));
    }
    expect([...seen].sort().join("")).toBe([...REF_ALPHABET].sort().join(""));
  });

  it("rejects a random source that returns too few bytes", () => {
    expect(() => generatePublicRef("ORG", () => Uint8Array.from([1, 2]))).toThrow(RangeError);
  });

  it("is accepted by the same pattern the database check constraints use", () => {
    const campaignPattern = /^CMP-[0-9A-HJKMNP-TV-Z]{4}$/;
    const organisationPattern = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;
    const aliasPattern = /^ALI-[0-9A-HJKMNP-TV-Z]{4}$/;
    const leadPattern = /^LD-[0-9A-HJKMNP-TV-Z]{4}$/;
    const meetingPattern = /^MTG-[0-9A-HJKMNP-TV-Z]{4}$/;
    const messagePattern = /^MSG-[0-9A-HJKMNP-TV-Z]{4}$/;
    for (let byte = 0; byte < 256; byte += 1) {
      const bytes = () => Uint8Array.from([byte, byte >> 1, 255 - byte, byte ^ 0x5a]);
      expect(generatePublicRef("CMP", bytes)).toMatch(campaignPattern);
      expect(generatePublicRef("ORG", bytes)).toMatch(organisationPattern);
      expect(generatePublicRef("ALI", bytes)).toMatch(aliasPattern);
      expect(generatePublicRef("LD", bytes)).toMatch(leadPattern);
      expect(generatePublicRef("MTG", bytes)).toMatch(meetingPattern);
      expect(generatePublicRef("MSG", bytes)).toMatch(messagePattern);
    }
  });
});

describe("isPublicRef", () => {
  it.each(["CMP-7Q2X", "CMP-0000", "CMP-ZZZZ"])("accepts %s", (value) => expect(isPublicRef(value, "CMP")).toBe(true));
  it.each(["MTG-7Q2X", "MTG-0000", "MTG-ZZZZ"])("accepts meeting %s", (value) => expect(isPublicRef(value, "MTG")).toBe(true));
  it.each(["MSG-7Q2X", "MSG-0000", "MSG-ZZZZ"])("accepts message %s", (value) => expect(isPublicRef(value, "MSG")).toBe(true));
  it.each(["CMP-7Q2", "CMP-7Q2XY", "cmp-7q2x", "CMP-7QIX", "CMP-7QLX", "CMP-7QOX", "CMP-7QUX", "ORG-7Q2X", "CMP7Q2X"])("refuses %s", (value) => expect(isPublicRef(value, "CMP")).toBe(false));
});
