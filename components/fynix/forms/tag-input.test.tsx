import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TagInput } from "./tag-input";

describe("TagInput", () => {
  it("shows each value as a removable chip and posts them as one comma separated field", () => {
    const html = renderToStaticMarkup(<TagInput id="titles" name="jobTitles" value="CEO, Head of Marketing" onChange={() => undefined} />);
    expect(html).toContain("Remove CEO");
    expect(html).toContain("Remove Head of Marketing");
    expect(html).toContain('name="jobTitles"');
    expect(html).toContain('value="CEO, Head of Marketing"');
  });

  it("shows the placeholder only while the list is empty", () => {
    const empty = renderToStaticMarkup(<TagInput id="t" name="n" value="" placeholder="Type one" onChange={() => undefined} />);
    const full = renderToStaticMarkup(<TagInput id="t" name="n" value="CEO" placeholder="Type one" onChange={() => undefined} />);
    expect(empty).toContain('placeholder="Type one"');
    expect(full).not.toContain('placeholder="Type one"');
  });
});
