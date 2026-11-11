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

describe("scrubContactDetails: phones without a leading +, 0 or bracket", () => {
  it.each(["98765 43210", "415 555 0132", "415-555-0132", "415.555.0132", "+4 4 7 7 0 0 9 0 0 1 2 3"])("removes %s", (phone) => {
    expect(scrubContactDetails(`WhatsApp me on ${phone}`)).toEqual({ text: `WhatsApp me on ${R}`, removed: 1 });
  });

  it("removes a phone that is split by a tab, a newline or a narrow no-break space", () => {
    for (const phone of ["+44\t20\t7946\t0958", "+44 20\n7946 0958", "+44 20 7946 0958", "+44 20 7946 0958"]) {
      expect(scrubContactDetails(phone)).toEqual({ text: R, removed: 1 });
    }
  });

  it("removes a phone with a zero-width character inside", () => {
    expect(scrubContactDetails("+44 20​7946 0958")).toEqual({ text: R, removed: 1 });
    expect(scrubContactDetails("07700⁠ 900123")).toEqual({ text: R, removed: 1 });
  });

  it("reads fullwidth and Arabic-Indic digits", () => {
    expect(scrubContactDetails("＋４４７７００９００１２３")).toEqual({ text: R, removed: 1 });
    expect(scrubContactDetails("+٩١ ٩٨٧٦٥ ٤٣٢١٠")).toEqual({ text: R, removed: 1 });
  });

  it("removes an extension together with the number", () => {
    expect(scrubContactDetails("Ring +44 20 7946 0958 ext 12 please")).toEqual({ text: `Ring ${R} please`, removed: 1 });
    expect(scrubContactDetails("Ring +44 20 7946 0958 ext. 4")).toEqual({ text: `Ring ${R}`, removed: 1 });
    expect(scrubContactDetails("Ring +44 20 7946 0958 x123")).toEqual({ text: `Ring ${R}`, removed: 1 });
  });

  it("still leaves a number with fewer than 9 digits", () => {
    expect(scrubContactDetails("+44 7946 09")).toEqual({ text: "+44 7946 09", removed: 0 });
  });
});

describe("scrubContactDetails: bare domains and meeting hosts", () => {
  it.each([
    "kestrelledger.co.uk",
    "example.com/jane",
    "calendly.com/jane",
    "meet.google.com/abc-defg-hij",
    "zoom.us/j/123",
    "zoom.us/j/123456789?pwd=abc",
    "teams.microsoft.com/l/meetup-join/xyz",
    "lnkd.in/x",
    "bit.ly/x",
    "Example.COM",
  ])("removes %s", (domain) => {
    expect(scrubContactDetails(`Details at ${domain} today`)).toEqual({ text: `Details at ${R} today`, removed: 1 });
  });

  it("leaves the full stop that ends a sentence", () => {
    expect(scrubContactDetails("Visit kestrelledger.co.uk.")).toEqual({ text: `Visit ${R}.`, removed: 1 });
    expect(scrubContactDetails("Visit example.com/jane.")).toEqual({ text: `Visit ${R}.`, removed: 1 });
  });

  it.each(["hxxps://example.com", "hxxp://example.com/a", "HTTP://EXAMPLE.COM", "https:example.com", "https:// example.com", "ftp://example.com/file"])(
    "removes the obfuscated or odd scheme %s",
    (url) => {
      expect(scrubContactDetails(`Go to ${url} now`)).toEqual({ text: `Go to ${R} now`, removed: 1 });
    },
  );

  it("does not take ordinary prose for a domain", () => {
    for (const text of ["e.g. the budget, i.e. this year", "Mr.Smith and Ms.Jones", "We run v2.1 of the tool", "Thanks.No rush", "approx. 3.5 million", "U.S. and U.K. firms"]) {
      expect(scrubContactDetails(text)).toEqual({ text, removed: 0 });
    }
  });
});

describe("scrubContactDetails: obfuscated and non-ASCII emails", () => {
  it.each([
    ["jane [at] example [dot] com", R],
    ["jane(at)example.com", R],
    ["jane at example dot com", R],
    ["Write to jane at example dot com", `Write to ${R}`],
    ["example(dot)com", R],
    ["jane%40example.com", R],
    ["mailto:jane%40example.com", `mailto:${R}`],
    ["jané@example.com", R],
    ["jane@exämple.com", R],
    ["jane@例え.jp", R],
    ["jane＠example.com", R],
    ["jane@exam​ple.com", R],
    ["ja​ne@example.com", R],
    ["jane​@example.com", R],
  ])("removes %j", (input, text) => {
    expect(scrubContactDetails(input)).toEqual({ text, removed: 1 });
  });

  it("does not turn an ordinary 'at' into an address", () => {
    for (const text of ["Meet me at noon.It was fine", "We start at 3.5 percent", "Look at the example. Then stop."]) {
      expect(scrubContactDetails(text)).toEqual({ text, removed: 0 });
    }
  });
});

describe("scrubContactDetails: handles", () => {
  it("removes an @handle and a Skype name", () => {
    expect(scrubContactDetails("Find @jane_doe on twitter")).toEqual({ text: `Find ${R} on twitter`, removed: 1 });
    expect(scrubContactDetails("Follow @jane_doe.")).toEqual({ text: `Follow ${R}.`, removed: 1 });
    expect(scrubContactDetails("skype: jane.doe")).toEqual({ text: `skype: ${R}`, removed: 1 });
  });

  it("leaves a lone @ and a time written with @", () => {
    for (const text of ["Meet @ 3pm", "Call back @3pm", "Reach me @ the office"]) {
      expect(scrubContactDetails(text)).toEqual({ text, removed: 0 });
    }
  });
});

describe("scrubContactDetails: the returned text is normalised", () => {
  it("applies NFKC, drops format characters and maps digits to ASCII", () => {
    expect(scrubContactDetails("ｆｕｌｌｗｉｄｔｈ ca​fé ٣ units")).toEqual({ text: "fullwidth café 3 units", removed: 0 });
  });
});

describe("scrubContactDetails: numbers that are not phones", () => {
  it.each([
    "Revenue 0.45 - 0.60 - 0.75 million",
    "Headcount (12) 15 18 22 25 30",
    "Budget (2026) 2027 2028 2029",
    "Budget (2026) 2027 2028",
    "Dates 2026-11-12 and 12/11/2026",
    "Meeting on 2026-11-12 14:00",
    "Budget is 45,000 pounds",
    "They stock 1,200 product lines",
    "Lead LD-4K9P and meeting MT-1002",
    "Growth of 12.3456789 percent",
    "Between 0 to 100,000 pounds",
  ])("leaves %j untouched", (text) => {
    expect(scrubContactDetails(text)).toEqual({ text, removed: 0 });
  });

  // shortcut: a long digit run is read as a phone, so reference numbers of 9 or more digits go too. Upgrade by letting Fynix review risky text.
  it("removes a bare ten digit reference, which cannot be told from a phone", () => {
    expect(scrubContactDetails("Order 0001234567")).toEqual({ text: `Order ${R}`, removed: 1 });
  });
});
