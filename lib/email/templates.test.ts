import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, LINK_REMOVED_TEXT, formatEmailDate, parseEmailContent, renderEmail, type EmailContent } from "./templates";

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

  it("covers every template in EMAIL_TEMPLATES", () => {
    expect([...EMAIL_TEMPLATES].sort()).toEqual(["alias_code", "invite", "password_reset"]);
  });
});

describe("formatEmailDate", () => {
  it("writes the day in UTC, in words", () => {
    expect(formatEmailDate(new Date("2026-12-08T23:30:00.000Z"))).toBe("8 December 2026");
  });
});
