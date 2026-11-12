import { describe, expect, it } from "vitest";
import { escapeHtml, safeHref } from "./escape";

describe("escapeHtml", () => {
  it("escapes the five characters that can open a tag or close an attribute", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Priya Nair, Kestrel")).toBe("Priya Nair, Kestrel");
  });
});

describe("safeHref", () => {
  it("returns an escaped web address", () => {
    expect(safeHref("https://leads.fynix.digital/accept-invite?token=a&b=c")).toBe("https://leads.fynix.digital/accept-invite?token=a&amp;b=c");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", "//evil.example"])("refuses %s", (value) => {
    expect(() => safeHref(value)).toThrow();
  });
});
