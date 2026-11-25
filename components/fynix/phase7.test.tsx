import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CATALOG, SAMPLES } from "@/lib/email/samples";
import type { AuditPage } from "@/server/domain/audit-overview";

// The second step panel calls server actions, which need a running app. Only the markup is checked here.
vi.mock("@/server/auth/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { startSecondFactorAction: action, confirmSecondFactorAction: action, disableSecondFactorAction: action };
});

const { AuditScreen } = await import("@/components/fynix/audit/audit-screen");
const { TemplatesScreen } = await import("@/components/fynix/templates/templates-screen");
const { SecondFactorPanel } = await import("@/components/profile/second-factor-panel");

const NONE = { prefix: "", subject: "", person: "", q: "", page: 1 } as const;
const page = (overrides: Partial<AuditPage> = {}): AuditPage => ({
  rows: [{ id: "r1", at: new Date("2026-11-20T09:00:00Z"), by: "Meera Sethi", action: "campaign.close", subjectTable: "campaign", subjectRef: "CMP-7Q2X" }],
  total: 1,
  page: 1,
  pages: 1,
  people: [{ userId: "11111111-1111-4111-8111-111111111111", name: "Meera Sethi" }],
  prefixes: ["campaign", "lead"],
  ...overrides,
});

describe("Audit log screen", () => {
  it("shows when, who, the action in words, and the subject reference", () => {
    const html = renderToStaticMarkup(<AuditScreen data={page()} filter={NONE} />);
    expect(html).toContain("Meera Sethi");
    expect(html).toContain("Campaign closed");
    expect(html).toContain("CMP-7Q2X");
    expect(html).toContain("Showing 1 to 1 of 1");
    expect(html).toContain('name="action"');
    expect(html).not.toContain("Clear");
  });

  it("keeps the filters in the form, offers Clear when one is set, and links to the next page with them", () => {
    const html = renderToStaticMarkup(<AuditScreen data={page({ total: 120, pages: 3 })} filter={{ ...NONE, prefix: "campaign", q: "close" }} />);
    expect(html).toContain("Clear");
    expect(html).toContain('href="/fynix/audit?action=campaign&amp;q=close&amp;page=2"');
  });

  it("says so when nothing matches, and when nothing is recorded", () => {
    expect(renderToStaticMarkup(<AuditScreen data={page({ rows: [], total: 0 })} filter={{ ...NONE, q: "zzz" }} />)).toContain("Nothing matches");
    expect(renderToStaticMarkup(<AuditScreen data={page({ rows: [], total: 0 })} filter={NONE} />)).toContain("Nothing recorded yet");
  });
});

describe("Email templates screen", () => {
  const html = renderToStaticMarkup(<TemplatesScreen />);

  it("states that wording is changed in code, and offers no way to edit it", () => {
    expect(html).toContain("Wording is changed in code and reviewed. This page shows what each email looks like.");
    expect(html).not.toMatch(/<textarea|<form|contenteditable/i);
  });

  it("lists every template in its group with a sandboxed preview, its subject and an invariants line of OK", () => {
    const entries = CATALOG.flatMap((group) => group.entries);
    // One per template, however many there are: a template added without a catalogue entry fails samples.test.ts.
    const count = Object.keys(SAMPLES).length;
    expect(entries).toHaveLength(count);
    expect(html.match(/<iframe /g)).toHaveLength(count);
    expect(html.match(/sandbox=""/g)).toHaveLength(count);
    expect(html.match(/Invariants: (<!-- -->)?OK/g)).toHaveLength(count);
    expect(html).not.toContain("not OK");
    expect(html).toContain("Subject: </span>You are invited to Fynix Leads");
    for (const group of CATALOG) expect(html.replaceAll("&#x27;", "'")).toContain(group.audience);
  });

  it("uses the sample names only", () => {
    expect(html).toContain("Sample Prospect Co");
    expect(html).not.toMatch(/kestrel|brightpath/i);
  });
});

describe("Second sign-in step panel", () => {
  it("offers set-up with a password when it is off, and says what it is for", () => {
    const html = renderToStaticMarkup(<SecondFactorPanel enabled={false} required={false} />);
    expect(html).toContain("Set up");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Fynix accounts need this step");
  });

  it("says the step is needed while the deployment requires it", () => {
    expect(renderToStaticMarkup(<SecondFactorPanel enabled={false} required />)).toContain("Fynix accounts need this step before the other screens open");
  });

  it("offers turning it off, with the password, when it is on", () => {
    const html = renderToStaticMarkup(<SecondFactorPanel enabled required />);
    expect(html).toContain("Turn off");
    expect(html).toContain("Turning it off deletes your backup codes.");
    expect(html).not.toContain("Fynix accounts need this step");
  });
});
