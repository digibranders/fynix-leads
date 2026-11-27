import { describe, expect, it } from "vitest";
import { LETTER_OPENING_MAX, checkLetterOpening, nameCore, tidyLetterOpening } from "./letter-opening";

const GOOD = "We help cold chain teams cut spoilage, and I thought a short call would be useful.";

describe("the opening paragraph of a prospect letter", () => {
  it("accepts a plain paragraph", () => {
    expect(checkLetterOpening(GOOD)).toEqual({ ok: true, problems: [] });
  });

  it("collapses white space and line breaks into one paragraph", () => {
    expect(tidyLetterOpening("  Two   lines\n\nof text.  ")).toBe("Two lines of text.");
  });

  it("refuses an empty paragraph and one that is too long", () => {
    expect(checkLetterOpening("   ").ok).toBe(false);
    expect(checkLetterOpening("a".repeat(LETTER_OPENING_MAX)).ok).toBe(true);
    expect(checkLetterOpening("a".repeat(LETTER_OPENING_MAX + 1)).problems).toEqual([`Keep the paragraph to ${LETTER_OPENING_MAX} characters or fewer.`]);
  });

  it.each(["See https://example.com for more.", "Visit www.example.com today.", "Write to anna@example.com.", "Our site is example.io if you want to read more."])("refuses a web or email address: %s", (text) => {
    expect(checkLetterOpening(text).problems).toEqual(["Take out the web or email address. A letter holds only the meeting link and the client's privacy page."]);
  });

  it("does not mistake an ordinary sentence end or an abbreviation for an address", () => {
    expect(checkLetterOpening("Thank you for your time. We look forward to it, e.g. on Tuesday.").ok).toBe(true);
  });

  it("refuses the word Fynix, whatever the case", () => {
    expect(checkLetterOpening("A note from the FYNIX team.").problems).toEqual(["Take out the word Fynix. A prospect must never read it."]);
  });

  it("refuses the name of the coordinator or of an agency, whatever the case, and ignores an empty name", () => {
    const names = ["Brightpath Marketing Ltd", "Ridgeway Partner Ltd", "  "];
    expect(checkLetterOpening("Sent by brightpath marketing ltd for you.", names).problems).toEqual(["Take out the name of the coordinator or agency. A prospect must never read it."]);
    expect(checkLetterOpening(GOOD, names).ok).toBe(true);
  });

  it("refuses the everyday form of a name too: the name without its legal ending", () => {
    const names = ["Brightpath Marketing Ltd", "Ridgeway Partner Limited", "Larkfield Outreach, Inc."];
    for (const text of ["Brightpath Marketing suggested we talk.", "Our friends at ridgeway partner said so.", "Larkfield Outreach sent us."]) {
      expect(checkLetterOpening(text, names).problems, text).toEqual(["Take out the name of the coordinator or agency. A prospect must never read it."]);
    }
    expect(checkLetterOpening("A bright path lies ahead for cold chain teams.", names).ok).toBe(true);
  });

  it("takes the legal ending off a name, and keeps a name that would be too short without it", () => {
    expect(nameCore("Brightpath Marketing Ltd")).toBe("brightpath marketing");
    expect(nameCore("  Larkfield Outreach, Inc. ")).toBe("larkfield outreach");
    expect(nameCore("Nordvik Cold Chain Co. Ltd")).toBe("nordvik cold chain");
    expect(nameCore("Kestrel GmbH")).toBe("kestrel");
    expect(nameCore("AB Ltd")).toBe("ab ltd");
    expect(nameCore("Co Ltd")).toBe("co ltd");
    expect(nameCore("Bright   Path\tMedia  Ltd")).toBe("bright path media");
    expect(checkLetterOpening("Bright Path Media sent us.", ["Bright   Path Media Ltd"]).ok).toBe(false);
  });

  it("refuses a dash and an exclamation mark", () => {
    expect(checkLetterOpening("Good news \u2014 we can help.").problems).toEqual(["Use a comma or a full stop, not a long dash."]);
    expect(checkLetterOpening("We can help!").problems).toEqual(["Take out the exclamation mark."]);
  });
});
