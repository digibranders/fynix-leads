import { describe, expect, it } from "vitest";
import { cleanRich, isRichEmpty, richToHtml, richToText } from "./rich-text";
import { parseQuestions, pasteToBlocks, splitSections, toValueList } from "./rich-text-paste";

describe("cleanRich", () => {
  it("keeps the small subset and drops scripts, styles and event handlers", () => {
    const dirty = '<p style="color:red" onclick="x()">Hi <strong>there</strong><script>alert(1)</script></p><img src=x onerror=alert(1)>';
    expect(cleanRich(dirty)).toBe("<p>Hi <strong>there</strong></p>");
  });
  it("makes links open safely and refuses javascript links", () => {
    expect(cleanRich('<p><a href="https://a.test/x">a</a> <a href="javascript:alert(1)">b</a></p>')).toBe(
      '<p><a href="https://a.test/x" target="_blank" rel="noopener noreferrer nofollow">a</a> <a target="_blank" rel="noopener noreferrer nofollow">b</a></p>',
    );
  });
  it("maps b, i and h1 and removes the empty paragraphs Word leaves", () => {
    expect(cleanRich("<h1>T</h1><p>&nbsp;</p><p><b>x</b> <i>y</i></p>")).toBe("<h2>T</h2><p><strong>x</strong> <em>y</em></p>");
  });
});

describe("plain text from before", () => {
  it("becomes paragraphs and escapes markup", () => {
    expect(richToHtml("one\ntwo\n\n<b>three</b>")).toBe("<p>one<br>two</p><p>&lt;b&gt;three&lt;/b&gt;</p>");
    expect(richToText("<p>a</p><ul><li>b</li></ul>")).toBe("a\nb");
    expect(isRichEmpty("<p></p>")).toBe(true);
    expect(isRichEmpty("")).toBe(true);
  });
});

describe("parseQuestions", () => {
  it("reads a numbered list with Answer lines", () => {
    const html = "<ol><li>Do you have a budget?</li></ol><p><strong>Answer:</strong> Yes, above 10k.</p><ol><li>Who signs off?</li></ol><p>Answer: The CFO.</p>";
    const items = parseQuestions(pasteToBlocks({ html }));
    expect(items.map((item) => richToText(item.question))).toEqual(["Do you have a budget?", "Who signs off?"]);
    expect(items.map((item) => richToText(item.answer))).toEqual(["Yes, above 10k.", "The CFO."]);
  });
  it("reads nested bullets as the answer", () => {
    const html = "<ol><li>What is your timeline?<ul><li>Within 3 months</li><li>Open to a pilot</li></ul></li></ol>";
    const [item] = parseQuestions(pasteToBlocks({ html }));
    expect(richToText(item?.question ?? "")).toBe("What is your timeline?");
    expect(item?.answer).toContain("<ul>");
    expect(richToText(item?.answer ?? "")).toBe("Within 3 months\nOpen to a pilot");
  });
  it("reads a two column table and skips the header row", () => {
    const html = "<table><tr><th>Question</th><th>Expected answer</th></tr><tr><td>Do you outsource?</td><td>Sometimes</td></tr><tr><td>1</td><td>Team size?</td><td>10 to 50</td></tr></table>";
    const items = parseQuestions(pasteToBlocks({ html }));
    expect(items.map((item) => [richToText(item.question), richToText(item.answer)])).toEqual([
      ["Do you outsource?", "Sometimes"],
      ["Team size?", "10 to 50"],
    ]);
  });
  it("reads Q1 labels and ignores an introduction line", () => {
    const text = "Our qualifying questions:\nQ1. Are you hiring?\nA: Yes\nQ2. What is the budget?";
    const items = parseQuestions(pasteToBlocks({ text }));
    expect(items.map((item) => richToText(item.question))).toEqual(["Are you hiring?", "What is the budget?"]);
    expect(richToText(items[0]?.answer ?? "")).toBe("Yes");
  });
  it("reads Word style paragraphs that start with a number", () => {
    const html = "<p>1. First question?</p><p>2. Second question?</p>";
    expect(parseQuestions(pasteToBlocks({ html })).map((item) => richToText(item.question))).toEqual(["First question?", "Second question?"]);
  });
});

describe("splitSections", () => {
  const matchers = [
    { key: "introduction", test: /introduc|who we are/i },
    { key: "services", test: /service|offer/i },
    { key: "differentiator", test: /differenti|usp|sets? .*apart/i },
  ] as const;
  it("splits a document by its headings and keeps the lists", () => {
    const html = "<h2>How do you introduce your brand?</h2><p>We are Acme.</p><h2>Services</h2><ul><li>SEO</li><li>Ads</li></ul><p><strong>USP</strong></p><p>Fast.</p>";
    const sections = splitSections(pasteToBlocks({ html }), matchers);
    expect(sections.map((section) => section.key)).toEqual(["introduction", "services", "differentiator"]);
    expect(sections[1]?.html).toContain("<ul>");
    expect(richToText(sections[2]?.html ?? "")).toBe("Fast.");
  });
  it("keeps nested bullets nested, and bold and italic with them", () => {
    const html = "<h2>Services</h2><ul><li><p><b>Billing:</b> invoices plus:</p><ul><li><p>Cost per mile</p></li><li><p>Empty running</p></li></ul></li><li><p><i>Integrations</i></p></li></ul>";
    const [section] = splitSections(pasteToBlocks({ html }), matchers);
    expect(section?.html).toBe("<ul><li><p><strong>Billing:</strong> invoices plus:</p><ul><li><p>Cost per mile</p></li><li><p>Empty running</p></li></ul></li><li><p><em>Integrations</em></p></li></ul>");
  });
  it("does not take a sentence that ends in a colon for a heading", () => {
    const html = "<h2>Marketing collateral</h2><p>Share these when a prospect asks for something to read before the call:</p><ul><li>Overview</li></ul>";
    const sections = splitSections(pasteToBlocks({ html }), [{ key: "collateral", test: /collateral/i }] as const);
    expect(sections.map((section) => section.key)).toEqual(["collateral"]);
    expect(sections[0]?.html).toContain("Share these when a prospect asks");
    expect(sections[0]?.html).toContain("<ul>");
  });
  it("gives text before any heading a null key", () => {
    const sections = splitSections(pasteToBlocks({ text: "Some words\nServices:\nSEO" }), matchers);
    expect(sections.map((section) => section.key)).toEqual([null, "services"]);
  });
});

describe("toValueList", () => {
  it("takes bullets, lines and commas and drops duplicates", () => {
    expect(toValueList("<ul><li>CEO</li><li>CTO, CFO</li><li>ceo</li></ul>")).toEqual(["CEO", "CTO", "CFO"]);
  });
});
