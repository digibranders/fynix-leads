import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIcs, meetingUid } from "./ics";
import { checkEmailInvariants, type InvariantContext } from "./invariants";
import { LAUNCH_TEMPLATES, isProspectTemplate, launchCalendar, type LaunchContent, type LaunchParams } from "./launch-templates";
import { EMAIL_TEMPLATES, LINK_REMOVED_TEXT, formatEmailDate, linkRuleFor, parseEmailContent, renderEmail, type EmailContent, type EmailTemplate } from "./templates";

const LINK = "https://leads.fynix.digital/accept-invite?token=abc_DEF-123";
const INVITE: EmailContent = { template: "invite", params: { name: "Priya Nair", organisationName: "Kestrel Logistics Ltd", expiresOn: "8 December 2026" } };
const RESET: EmailContent = { template: "password_reset", params: { expiresInMinutes: 60 } };
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("renderEmail", () => {
  it("renders the invite with the person's name, their organisation, the last day and the link", () => {
    const mail = renderEmail(INVITE, LINK);
    expect(mail.subject).toBe("You are invited to Fynix Leads");
    expect(mail.text).toContain("Hello Priya Nair,");
    expect(mail.text).toContain("join Kestrel Logistics Ltd on Fynix Leads");
    expect(mail.text).toContain("by 8 December 2026");
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain(`href="${LINK}"`);
  });

  it("renders the reset message the way phase 1B worded it", () => {
    const mail = renderEmail(RESET, "https://x.example/reset-password?token=t");
    expect(mail.subject).toBe("Reset your Fynix Leads password");
    expect(mail.text).toContain("within 60 minutes");
    expect(mail.text).toContain("https://x.example/reset-password?token=t");
    expect(mail.text).toContain("If you did not ask for this, ignore this email.");
  });

  it("keeps the link out of the stored copy: with no link neither the text nor the HTML has one, and the copy still says how long it worked", () => {
    expect(renderEmail(RESET, null).text).toContain("within 60 minutes");
    expect(renderEmail(INVITE, null).text).toContain("by 8 December 2026");
    for (const content of [INVITE, RESET]) {
      const mail = renderEmail(content, null);
      expect(mail.text).toContain(LINK_REMOVED_TEXT);
      expect(mail.html).toContain(LINK_REMOVED_TEXT);
      expect(mail.text).not.toMatch(/https?:\/\//);
      expect(mail.html).not.toMatch(/https?:\/\//);
      expect(mail.html).not.toContain("href=");
    }
  });

  it("escapes every value it interpolates, in the HTML", () => {
    const hostile: EmailContent = { template: "invite", params: { name: `<img src=x onerror=alert(1)>`, organisationName: `A & B "Ltd"`, expiresOn: "<b>soon</b>" } };
    const { html, text } = renderEmail(hostile, LINK);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>soon");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("A &amp; B &quot;Ltd&quot;");
    // Plain text is not HTML, so it carries the characters as typed.
    expect(text).toContain("<img src=x onerror=alert(1)>");
  });

  it("refuses a link that is not a web address, rather than putting it in an href", () => {
    expect(() => renderEmail(INVITE, "javascript:alert(1)")).toThrow();
  });

  it("uses sentence case, no exclamation marks and no em or en dashes in any template", () => {
    for (const content of [INVITE, RESET]) {
      for (const link of [LINK, null]) {
        const mail = renderEmail(content, link);
        const all = `${mail.subject}\n${mail.text}\n${mail.html}`;
        expect(DASHES.test(all)).toBe(false);
        expect(all.replace("<!doctype html>", "")).not.toContain("!");
      }
    }
  });
});

describe("parseEmailContent", () => {
  it("reads stored params back into typed content", () => {
    expect(parseEmailContent("invite", { name: "A", organisationName: "B", expiresOn: "C" })).toEqual({ template: "invite", params: { name: "A", organisationName: "B", expiresOn: "C" } });
    expect(parseEmailContent("password_reset", { expiresInMinutes: 60 })).toEqual(RESET);
  });

  it.each([
    ["invite", { name: "A" }],
    ["invite", null],
    ["invite", []],
    ["password_reset", { expiresInMinutes: "60" }],
    ["password_reset", { expiresInMinutes: 0 }],
    ["unknown", {}],
  ])("refuses %s with %j", (template, params) => {
    expect(() => parseEmailContent(template, params)).toThrow();
  });

  it("reads an alias code message, and refuses a code that is not six digits", () => {
    expect(parseEmailContent("alias_code", { displayName: "Alex Croft", code: "042917" })).toEqual({ template: "alias_code", params: { displayName: "Alex Croft", code: "042917" } });
    expect(() => parseEmailContent("alias_code", { displayName: "Alex Croft", code: "4291" })).toThrow();
  });

  it("the alias code carries no link, because it is a code to type; the two account emails that act through a link need one", () => {
    expect(linkRuleFor("alias_code")).toBe("none");
    expect(linkRuleFor("password_reset")).toBe("required");
    expect(linkRuleFor("invite")).toBe("required");
    expect(renderEmail({ template: "alias_code", params: { displayName: "Alex Croft", code: "042917" } }, null).text).not.toContain(LINK_REMOVED_TEXT);
  });

  it("covers every template in EMAIL_TEMPLATES: the three account emails and the launch emails", () => {
    expect([...EMAIL_TEMPLATES].sort()).toEqual(["alias_code", "invite", "password_reset", ...LAUNCH_TEMPLATES].sort());
  });
});

describe("formatEmailDate", () => {
  it("writes the day in UTC, in words", () => {
    expect(formatEmailDate(new Date("2026-12-08T23:30:00.000Z"))).toBe("8 December 2026");
  });
});

// The launch emails (phase 6). One fixture per template, typed so that a template added without one fails the typecheck.
const MEET = "https://meet.google.com/abc-defg-hij";
const PORTAL = "https://leads.fynix.digital";
const PORTAL_LINK = `${PORTAL}/client/leads/LD-4K7M`;
const PRIVACY = "https://privacy.kestrel-logistics.example/policy";
const COORDINATOR = "Brightpath Marketing Ltd";
const AGENCY = "Ridgeway Partner Ltd";
const CALENDAR = { meetingRef: "MTG-3F7K", startsAt: "2026-12-08T14:30:00.000Z", endsAt: "2026-12-08T15:00:00.000Z", sequence: 2 } as const;
const PORTAL_PARAMS: LaunchParams = { ref: "LD-4K7M", company: "Nordvik Cold Chain", when: "Tuesday 8 December 2026, 14:30 Europe/London", meetUrl: MEET, calendar: CALENDAR };
const PROSPECT_PARAMS: LaunchParams = {
  prospectName: "Marta Lindqvist",
  clientBrand: "Kestrel Logistics",
  privacyUrl: PRIVACY,
  signerName: "Lena Hartmann",
  signerTitle: "Business development",
  when: "Tuesday 8 December 2026, 14:30 Europe/London",
  meetUrl: MEET,
  calendar: CALENDAR,
};
const portal = (template: LaunchContent["template"], extra: LaunchParams = {}): EmailContent => ({ template, params: { ...PORTAL_PARAMS, ...extra } }) as EmailContent;
const prospect = (template: LaunchContent["template"]): EmailContent => ({ template, params: PROSPECT_PARAMS }) as EmailContent;

const FIXTURES: Record<EmailTemplate, EmailContent> = {
  password_reset: RESET,
  invite: INVITE,
  alias_code: { template: "alias_code", params: { displayName: "Alex Croft", code: "042917" } },
  lead_waiting: portal("lead_waiting"),
  lead_submitted_info: portal("lead_submitted_info"),
  times_proposed_info: portal("times_proposed_info"),
  meeting_booked: portal("meeting_booked"),
  meeting_moved: portal("meeting_moved"),
  meeting_cancelled: portal("meeting_cancelled", { reason: "rejected", note: "The timing does not suit us.", noteFrom: "Client" }),
  outcome_nudge: portal("outcome_nudge"),
  outcome_held_client: portal("outcome_held_client"),
  outcome_held_info: portal("outcome_held_info"),
  decision_reminder: portal("decision_reminder", { hoursLeft: 24 }),
  lead_accepted_info: portal("lead_accepted_info"),
  lead_rejected_info: portal("lead_rejected_info", { note: "Not a fit for this quarter.", noteFrom: "Client" }),
  lead_auto_accepted_info: portal("lead_auto_accepted_info"),
  rejection_overturned_info: portal("rejection_overturned_info", { note: "The brief allowed it.", noteFrom: "Fynix" }),
  no_show_info: portal("no_show_info", { outcome: "client_no_show" }),
  lead_auto_accepted_client: portal("lead_auto_accepted_client"),
  rejection_overturned_client: portal("rejection_overturned_client", { note: "The brief allowed it.", noteFrom: "Fynix" }),
  client_no_show_client: portal("client_no_show_client"),
  postponement_proposed_info: portal("postponement_proposed_info", { proposedBy: "client" }),
  outcome_contested_info: portal("outcome_contested_info", { note: "Two of us joined on time.", noteFrom: "Client" }),
  contest_decided_info: portal("contest_decided_info", { decided: "client_no_show", note: "The room record shows nobody from the client.", noteFrom: "Fynix" }),
  review_requested_info: portal("review_requested_info"),
  prospect_confirmed: prospect("prospect_confirmed"),
  prospect_moved: prospect("prospect_moved"),
  prospect_cancelled: prospect("prospect_cancelled"),
  prospect_reminder_24h: prospect("prospect_reminder_24h"),
  prospect_reminder_1h: prospect("prospect_reminder_1h"),
};
const INVARIANTS: InvariantContext = {
  portalLink: PORTAL_LINK,
  allowedProspectUrls: [MEET, PRIVACY],
  forbiddenInProspect: [/fynix/i, new RegExp(COORDINATOR, "i"), new RegExp(AGENCY, "i"), /Open the lead/, /leads\.fynix\.digital/, /\/client\/leads/],
};
const everyRendering = (content: EmailContent, link: string | null) => {
  const mail = renderEmail(content, link);
  return { ...mail, all: `${mail.subject}\n${mail.text}\n${mail.html}` };
};

describe("every template, rendered", () => {
  it.each(EMAIL_TEMPLATES)("%s: holds every rule of the shared check (dashes, exclamation marks, its link rule, and for a letter the names and addresses it must never carry)", (template) => {
    expect(checkEmailInvariants(FIXTURES[template], INVARIANTS)).toEqual({ ok: true, problems: [] });
  });

  it("the shared check finds a deliberate fault of each kind", () => {
    const dash = String.fromCharCode(0x2014);
    expect(checkEmailInvariants({ template: "invite", params: { ...INVITE.params, name: `A ${dash} B` } } as EmailContent, INVARIANTS).problems).toContain("The sent copy has an em or en dash.");
    expect(checkEmailInvariants({ template: "invite", params: { ...INVITE.params, name: "Priya!" } } as EmailContent, INVARIANTS).problems).toContain("The sent copy has an exclamation mark.");
    // A letter that names Fynix, and a portal email checked against a link it does not carry.
    const named = { template: "prospect_confirmed", params: { ...PROSPECT_PARAMS, clientBrand: "Fynix Logistics" } } as EmailContent;
    expect(checkEmailInvariants(named, INVARIANTS).ok).toBe(false);
    expect(checkEmailInvariants(FIXTURES.alias_code, { ...INVARIANTS, portalLink: "https://x.example/a" }).ok).toBe(true);
    const wrongUrl = { template: "prospect_confirmed", params: { ...PROSPECT_PARAMS, privacyUrl: "https://elsewhere.example/policy" } } as EmailContent;
    expect(checkEmailInvariants(wrongUrl, INVARIANTS).problems).toContain("The letter holds a web address that is not the meeting link or the privacy page.");
  });

  it.each(LAUNCH_TEMPLATES)("%s: reads back from its stored params, and a missing required field is refused", (template) => {
    const content = FIXTURES[template] as LaunchContent;
    expect(parseEmailContent(template, content.params)).toEqual(content);
    expect(() => parseEmailContent(template, {})).toThrow();
  });

  it("a message to a person of the portal carries a link to the lead, and says the link is not kept in the stored copy", () => {
    for (const template of LAUNCH_TEMPLATES.filter((name) => !isProspectTemplate(name))) {
      expect(linkRuleFor(template), template).toBe("required");
      const sent = everyRendering(FIXTURES[template], PORTAL_LINK);
      expect(sent.text, template).toContain(PORTAL_LINK);
      expect(sent.html, template).toContain(`href="${PORTAL_LINK}"`);
      const stored = everyRendering(FIXTURES[template], null);
      expect(stored.text, template).toContain(LINK_REMOVED_TEXT);
      expect(stored.all, template).not.toContain(PORTAL_LINK);
    }
  });

  it("the client's reminder counts the time left and turns into a final warning at 12 hours", () => {
    expect(everyRendering(portal("decision_reminder", { hoursLeft: 36 }), PORTAL_LINK).subject).toBe("Reminder: accept or reject lead LD-4K7M");
    expect(everyRendering(portal("decision_reminder", { hoursLeft: 36 }), PORTAL_LINK).text).toContain("36 hours are left before it is accepted automatically");
    expect(everyRendering(portal("decision_reminder", { hoursLeft: 24 }), PORTAL_LINK).text).toContain("24 hours are left");
    const final = everyRendering(portal("decision_reminder", { hoursLeft: 12 }), PORTAL_LINK);
    expect(final.subject).toBe("Final reminder: lead LD-4K7M is accepted automatically in 12 hours");
    expect(final.text).toContain("This is the last reminder.");
  });

  it("the client's no-show email says it counts as one and that the outcome can be contested", () => {
    const mail = everyRendering(FIXTURES.client_no_show_client, PORTAL_LINK);
    expect(mail.text).toContain("The lead counts as one.");
    expect(mail.text).toContain("contest the outcome");
  });

  it("a proposal of new times is worded for the side that picks", () => {
    expect(everyRendering(FIXTURES.postponement_proposed_info, PORTAL_LINK).subject).toBe("The client proposed new times for LD-4K7M");
    expect(everyRendering(portal("postponement_proposed_info", { proposedBy: "supply" }), PORTAL_LINK).subject).toBe("New times proposed for LD-4K7M");
  });

  it("a contest and its decision carry the note with who wrote it, and the decision says what it means for the count", () => {
    expect(everyRendering(FIXTURES.outcome_contested_info, PORTAL_LINK).text).toContain("Note from Client: Two of us joined on time.");
    const decided = everyRendering(FIXTURES.contest_decided_info, PORTAL_LINK).text;
    expect(decided).toContain("The client did not attend. It counts as one.");
    expect(decided).toContain("Note from Fynix: The room record shows nobody from the client.");
    expect(everyRendering(FIXTURES.rejection_overturned_client, PORTAL_LINK).text).toContain("Note from Fynix: The brief allowed it.");
  });

  it("the cancelled email gives the note, labelled with who wrote it", () => {
    expect(everyRendering(FIXTURES.meeting_cancelled, PORTAL_LINK).text).toContain("Note from Client: The timing does not suit us.");
    expect(everyRendering(portal("meeting_cancelled", { reason: "rejected" }), PORTAL_LINK).text).not.toContain("Note from");
  });
});

describe("prospect letters", () => {
  const LETTERS = LAUNCH_TEMPLATES.filter(isProspectTemplate);
  const FORBIDDEN = [/fynix/i, new RegExp(COORDINATOR, "i"), new RegExp(AGENCY, "i"), /Open the lead/, /leads\.fynix\.digital/, /\/client\/leads/];

  it.each(LETTERS)("%s: never names Fynix, the coordinator, an agency or the portal, and has no portal link", (template) => {
    expect(linkRuleFor(template)).toBe("none");
    for (const link of [null, PORTAL_LINK]) {
      const { all } = everyRendering(FIXTURES[template], link);
      for (const pattern of FORBIDDEN) expect(all, `${template} ${pattern}`).not.toMatch(pattern);
      // The only addresses in a letter are the Meet link and the client's own privacy page.
      const urls = new Set((all.match(/https?:\/\/[^\s"<]+/g) ?? []).map((url) => url.replace(/&amp;/g, "&")));
      for (const url of urls) expect([MEET, PRIVACY], `${template} ${url}`).toContain(url);
    }
  });

  it.each(LETTERS)("%s: ends with the signer and the privacy line, word for word", (template) => {
    const { text } = everyRendering(FIXTURES[template], null);
    expect(text.endsWith(`Best regards,\nLena Hartmann\nBusiness development, Kestrel Logistics\n\nKestrel Logistics holds your contact details to arrange this meeting. Privacy policy: ${PRIVACY}\nTo have your details removed, reply to this email.`)).toBe(true);
  });

  it("carries the Meet link in the body when there is one, and promises the link when there is none", () => {
    expect(everyRendering(FIXTURES.prospect_confirmed, null).text).toContain(`Join the meeting: ${MEET}`);
    const none = everyRendering({ template: "prospect_confirmed", params: { ...PROSPECT_PARAMS, meetUrl: null } }, null).text;
    expect(none).toContain("The link to join will be sent to you before the meeting.");
    expect(none).not.toContain("meet.google.com");
  });

  it.each(["https://evil.example/abc-defg-hij", "http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.example/x", "https://user@meet.google.com/x", "javascript:alert(1)"])(
    "refuses the meeting link %s when the content is read back",
    (meetUrl) => {
      expect(() => parseEmailContent("prospect_confirmed", { ...PROSPECT_PARAMS, meetUrl })).toThrow();
      expect(() => parseEmailContent("meeting_booked", { ...PORTAL_PARAMS, meetUrl })).toThrow();
    },
  );

  it("refuses a privacy link that is not https", () => {
    expect(() => parseEmailContent("prospect_confirmed", { ...PROSPECT_PARAMS, privacyUrl: "http://kestrel.example/privacy" })).toThrow();
  });

  it("escapes what it interpolates in the HTML", () => {
    const hostile = { template: "prospect_confirmed", params: { ...PROSPECT_PARAMS, prospectName: "<img src=x onerror=alert(1)>", clientBrand: 'A & "B"' } } as EmailContent;
    const { html } = everyRendering(hostile, null);
    expect(html).not.toContain("<img");
    expect(html).toContain("A &amp; &quot;B&quot;");
  });
});

describe("the calendar file of a meeting email", () => {
  const organiser = { address: "meetings@neutral.example", name: "Meetings" } as const;
  const file = (template: EmailTemplate, sequence: number, attendee = "marta@nordvik-cold.example") => {
    const content = { ...FIXTURES[template], params: { ...(FIXTURES[template] as LaunchContent).params, calendar: { ...CALENDAR, sequence } } } as EmailContent;
    const spec = launchCalendar(content as LaunchContent);
    if (spec === null) throw new Error(`${template} has no calendar file`);
    // Unfolded, as a calendar program reads it: long lines are folded at 75 octets (checked below).
    return buildIcs({ ...spec, organiser, attendee, stamp: new Date("2026-12-01T09:00:00.000Z") }).replace(/\r\n /g, "");
  };

  it("has a fixed id built from the meeting reference that names no company, and the same id in every email about the meeting", () => {
    expect(meetingUid("MTG-3F7K")).toBe("mtg-3f7k@leads.invalid");
    for (const template of ["prospect_confirmed", "prospect_moved", "prospect_cancelled", "meeting_booked", "meeting_moved", "meeting_cancelled"] as const) {
      expect(file(template, 0)).toContain("UID:mtg-3f7k@leads.invalid\r\n");
    }
    expect(file("meeting_booked", 0)).not.toMatch(/fynix/i);
  });

  it("rises with every postponement and cancellation, and is a request until the meeting is cancelled", () => {
    expect(file("prospect_confirmed", 0)).toContain("SEQUENCE:0\r\n");
    expect(file("prospect_moved", 1)).toContain("SEQUENCE:1\r\n");
    expect(file("prospect_moved", 2)).toContain("SEQUENCE:2\r\n");
    expect(file("prospect_cancelled", 3)).toContain("SEQUENCE:3\r\n");
    expect(file("prospect_moved", 1)).toContain("METHOD:REQUEST\r\n");
    expect(file("meeting_cancelled", 3)).toContain("METHOD:CANCEL\r\n");
    expect(file("meeting_cancelled", 3)).toContain("STATUS:CANCELLED\r\n");
  });

  it("names the neutral sender as organiser and the one recipient as attendee, and no one else", () => {
    const ics = file("prospect_confirmed", 0);
    expect(ics).toContain("ORGANIZER;CN=\"Meetings\":mailto:meetings@neutral.example\r\n");
    expect(ics.match(/ATTENDEE/g)).toHaveLength(1);
    expect(ics).toContain("mailto:marta@nordvik-cold.example\r\n");
    expect(ics).toContain("DTSTART:20261208T143000Z\r\n");
    expect(ics).toContain("DTEND:20261208T150000Z\r\n");
    expect(ics).toContain("SUMMARY:Meeting with Kestrel Logistics\r\n");
    expect(ics).not.toMatch(/Brightpath|Ridgeway|Fynix/i);
  });

  it("folds long lines at 75 octets and escapes commas, semicolons and line breaks", () => {
    const content = { template: "meeting_booked", params: { ...PORTAL_PARAMS, company: "Nordvik; Cold, Chain ".repeat(8) } } as EmailContent;
    const spec = launchCalendar(content as LaunchContent);
    const ics = buildIcs({ ...(spec as NonNullable<typeof spec>), organiser, attendee: "a@example.com", stamp: new Date("2026-12-01T09:00:00.000Z") });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("Nordvik\\; Cold\\, Chain");
  });

  it("only the meeting emails have a file: not the reminders and not the other emails", () => {
    for (const template of LAUNCH_TEMPLATES) {
      const has = launchCalendar(FIXTURES[template] as LaunchContent) !== null;
      expect(has, template).toBe(["meeting_booked", "meeting_moved", "meeting_cancelled", "prospect_confirmed", "prospect_moved", "prospect_cancelled"].includes(template));
    }
  });
});

describe("where raw colours and tables live", () => {
  it("only design.ts holds a colour, a font or a table", () => {
    const files = readdirSync(__dirname).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "design.ts");
    expect(files).toContain("launch-templates.ts");
    for (const name of files) {
      const source = readFileSync(join(__dirname, name), "utf8");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b|<table|font-family/);
    }
  });
});
