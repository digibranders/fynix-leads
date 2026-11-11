import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relayText } from "./relay-text";

describe("relayText", () => {
  it("trims the text and scrubs contact details", () => {
    expect(relayText("  Ring 07700 900123 or jane@example.com  ")).toEqual({ text: "Ring [removed] or [removed]", removed: 2 });
  });

  it("leaves clean text alone", () => {
    expect(relayText("Budget confirmed for this year.")).toEqual({ text: "Budget confirmed for this year.", removed: 0 });
  });

  it("gives an empty string for blank input, including a lone zero-width character", () => {
    expect(relayText("   ")).toEqual({ text: "", removed: 0 });
    expect(relayText(" ​ ")).toEqual({ text: "", removed: 0 });
  });
});

describe("relayText is the only way in", () => {
  const files = ["app", "components"].flatMap((dir) =>
    readdirSync(join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(dir, f)),
  );

  it.each(files)("%s does not call the scrubber directly", (file) => {
    expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(/relay\/scrub["']/);
  });
});
