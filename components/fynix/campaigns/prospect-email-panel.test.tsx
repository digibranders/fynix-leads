import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The forms call server actions, which need a running app. The panel only needs its words and buttons to render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
const action = async () => ({ status: "idle" as const });
vi.mock("@/server/fynix/actions", () => ({ setPrivacyLinkAction: action, removePrivacyLinkAction: action, setProspectEmailAction: action, setLetterOpeningAction: action, removeLetterOpeningAction: action }));

const { ProspectEmailPanel } = await import("./prospect-email-panel");

const base = { campaignId: "11111111-1111-4111-8111-111111111111", privacyUrl: null, prospectEmailEnabled: false, letterOpening: null, launchEmailsOn: true, canWrite: true } as const;
const OPENING = "We help cold chain teams cut spoilage, and I thought a short call would be useful.";
const render = (over: Partial<Parameters<typeof ProspectEmailPanel>[0]> = {}) => renderToStaticMarkup(<ProspectEmailPanel {...base} {...over} />);

describe("the Prospect email panel", () => {
  it("lets an admin add a link, and switch letters on", () => {
    const html = render();
    expect(html).toContain("Not set");
    expect(html).toContain("Add link");
    expect(html).not.toContain("Remove link");
    expect(html).toContain("Switch on");
  });

  it("shows the link, lets an admin change or remove it, and says removing it switches letters off", () => {
    const html = render({ privacyUrl: "https://kestrel.example/privacy", prospectEmailEnabled: true });
    expect(html).toContain('href="https://kestrel.example/privacy"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Change link");
    expect(html).toContain("Remove link");
    expect(html).toContain("Switch off");
    expect(html).toContain("Removing the link also switches letters to prospects off.");
  });

  it("is read-only for staff: no buttons, and a line that an admin changes it", () => {
    const html = render({ privacyUrl: "https://kestrel.example/privacy", prospectEmailEnabled: true, canWrite: false });
    expect(html).not.toContain("<button");
    expect(html).toContain("A Fynix admin changes this.");
    expect(html).toContain("On");
  });

  it("shows the default wording until an admin writes an opening paragraph, with a preview of the confirmation letter either way", () => {
    const html = render();
    expect(html).toContain("Opening paragraph");
    expect(html).toContain("Default wording");
    expect(html).toContain("Write paragraph");
    expect(html).not.toContain("Remove paragraph");
    expect(html.match(/<iframe /g)).toHaveLength(1);
    expect(html).toContain('sandbox=""');
    expect(html).toContain("Thank you for agreeing to talk.");
  });

  it("shows the paragraph, lets an admin change or remove it, and previews the letter with it in place of the default first sentence", () => {
    const html = render({ letterOpening: OPENING });
    expect(html).toContain(OPENING);
    expect(html).toContain("Change paragraph");
    expect(html).toContain("Remove paragraph");
    expect(html).not.toContain("Thank you for agreeing to talk.");
    expect(html).toContain("Sample Person");
  });

  it("shows staff the paragraph and the preview, and no button", () => {
    const html = render({ letterOpening: OPENING, canWrite: false });
    expect(html).toContain(OPENING);
    expect(html).not.toContain("<button");
    expect(html.match(/<iframe /g)).toHaveLength(1);
  });

  it("says when launch emails are off on the server, and says nothing when they are on", () => {
    expect(render({ launchEmailsOn: false })).toContain("Launch emails are off on this server");
    expect(render({ launchEmailsOn: true })).not.toContain("Launch emails are off");
  });

  it("has no dashes in its words", () => {
    expect(render({ launchEmailsOn: false, privacyUrl: "https://kestrel.example/privacy", prospectEmailEnabled: true, letterOpening: OPENING }).replace(/<[^>]*>/g, " ")).not.toMatch(/[\u2013\u2014]/);
  });
});
