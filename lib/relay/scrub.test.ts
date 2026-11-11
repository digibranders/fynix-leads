import { describe, expect, it } from "vitest";
import { scrubContactDetails } from "./scrub";

const R = "[removed]";

describe("scrubContactDetails: emails", () => {
  it("removes a plain email", () => {
    expect(scrubContactDetails("Write to jane.doe@example.co.uk today")).toEqual({
      text: `Write to ${R} today`,
      removed: 1,
    });
  });

  it("removes an email with a plus tag", () => {
    expect(scrubContactDetails("jane+leads@example.com")).toEqual({ text: R, removed: 1 });
  });

  it("keeps the full stop after an email", () => {
    expect(scrubContactDetails("Her address is jane@example.com.")).toEqual({
      text: `Her address is ${R}.`,
      removed: 1,
    });
  });
});

describe("scrubContactDetails: urls", () => {
  it("removes http and https urls", () => {
    expect(scrubContactDetails("See http://example.com/a and https://example.com/b?x=1")).toEqual({
      text: `See ${R} and ${R}`,
      removed: 2,
    });
  });

  it("removes www urls without a scheme", () => {
    expect(scrubContactDetails("Site: www.example.co.uk/about")).toEqual({ text: `Site: ${R}`, removed: 1 });
  });

  it("removes LinkedIn profile paths written without a scheme", () => {
    expect(scrubContactDetails("Find her at linkedin.com/in/someone please")).toEqual({
      text: `Find her at ${R} please`,
      removed: 1,
    });
  });

  it("leaves punctuation after a url in place", () => {
    expect(scrubContactDetails("(see https://example.com/page).")).toEqual({ text: `(see ${R}).`, removed: 1 });
  });
});

describe("scrubContactDetails: phone numbers", () => {
  it.each([
    "+44 20 7946 0123",
    "020 7946 0123",
    "07700 900123",
    "+1 (212) 555-0147",
    "+91 98765 43210",
  ])("removes %s", (phone) => {
    expect(scrubContactDetails(`Number: ${phone}`)).toEqual({ text: `Number: ${R}`, removed: 1 });
  });

  it("matches next to punctuation", () => {
    expect(scrubContactDetails("call me on 020 7946 0123.")).toEqual({ text: `call me on ${R}.`, removed: 1 });
  });
});

describe("scrubContactDetails: several matches and counting", () => {
  it("counts every removal in one string", () => {
    const input = "Email jane@example.com, ring 07700 900123 or visit www.example.com and linkedin.com/in/jane.";
    expect(scrubContactDetails(input)).toEqual({
      text: `Email ${R}, ring ${R} or visit ${R} and ${R}.`,
      removed: 4,
    });
  });

  it("treats an email inside a url as one removal", () => {
    expect(scrubContactDetails("https://example.com/u/jane@example.com")).toEqual({ text: R, removed: 1 });
  });
});

describe("scrubContactDetails: ordinary text", () => {
  it.each([
    "Please confirm the budget.",
    "The meeting is on 2026-11-12.",
    "Moved from 12/11/2026 to the following week.",
    "Budget is 45,000 pounds this year.",
    "Lead LD-4K9P and meeting MT-1002 are linked.",
    "Call is on 3 July at 2:30 pm.",
    "They run 1,200 product lines across 12 bank accounts.",
    "",
  ])("leaves %j unchanged", (text) => {
    expect(scrubContactDetails(text)).toEqual({ text, removed: 0 });
  });
});
