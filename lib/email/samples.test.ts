import { describe, expect, it } from "vitest";
import { checkEmailInvariants } from "./invariants";
import { CATALOG, SAMPLES, SAMPLE_INVARIANT_CONTEXT } from "./samples";
import { EMAIL_TEMPLATES, parseEmailContent, renderEmail } from "./templates";

describe("the samples for the templates screen", () => {
  it("has one for every template, and each is valid content that reads back from its own params", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...EMAIL_TEMPLATES].sort());
    for (const template of EMAIL_TEMPLATES) expect(parseEmailContent(template, SAMPLES[template].params), template).toEqual(SAMPLES[template]);
  });

  it("passes the shared rules, so the screen can say OK for every template", () => {
    for (const template of EMAIL_TEMPLATES) expect(checkEmailInvariants(SAMPLES[template], SAMPLE_INVARIANT_CONTEXT), template).toEqual({ ok: true, problems: [] });
  });

  it("is obviously made up: no real company, no address that could be real", () => {
    const everything = EMAIL_TEMPLATES.map((template) => JSON.stringify(SAMPLES[template].params)).join("\n");
    expect(everything).not.toMatch(/kestrel|brightpath|northgate/i);
    for (const url of everything.match(/https?:\/\/[^"\s]+/g) ?? []) expect(url.startsWith("https://meet.google.com/aaa-bbbb-ccc") || /\.test[/"]?/.test(url), url).toBe(true);
    expect(renderEmail(SAMPLES.invite, null).text).toContain("Sample Person");
  });
});

describe("the catalogue", () => {
  it("lists every template exactly once, in the group of who receives it", () => {
    const listed = CATALOG.flatMap((group) => group.entries.map((entry) => entry.template));
    expect(listed.sort()).toEqual([...EMAIL_TEMPLATES].sort());
    expect(CATALOG.find((group) => group.audience === "The prospect")?.entries.every((entry) => entry.template.startsWith("prospect_"))).toBe(true);
  });

  it("words every title and sentence in sentence case with no dash and no exclamation mark", () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const group of CATALOG) for (const entry of [{ title: group.audience, when: "" }, ...group.entries]) expect(`${entry.title} ${entry.when}`).not.toMatch(dash);
  });
});
