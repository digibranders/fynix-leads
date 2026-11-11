import { describe, expect, it } from "vitest";
import { cn } from "./utils";

const SIZES = ["caption", "label", "table", "body", "row", "value", "lead", "title", "name", "figure", "hero"] as const;

describe("cn with the design system type scale", () => {
  it("keeps a text size and a text colour, whichever comes first", () => {
    expect(cn("text-ink text-body")).toBe("text-ink text-body");
    expect(cn("text-body text-ink")).toBe("text-body text-ink");
    expect(cn("text-ink-2", "text-name")).toBe("text-ink-2 text-name");
    expect(cn("text-red-text text-table")).toBe("text-red-text text-table");
  });

  it.each(SIZES)("treats text-%s as a font size, so a later size wins and a colour stays", (size) => {
    expect(cn("text-ink", `text-${size}`)).toBe(`text-ink text-${size}`);
    expect(cn(`text-${size}`, "text-[13px]")).toBe("text-[13px]");
    expect(cn("text-sm", `text-${size}`)).toBe(`text-${size}`);
    expect(cn(`text-${size}`, "text-lg")).toBe("text-lg");
  });

  it("still lets a later colour override an earlier one", () => {
    expect(cn("text-ink text-body", "text-ink-2")).toBe("text-body text-ink-2");
  });

  it("merges ordinary classes and conditionals as before", () => {
    expect(cn("px-2 py-1", false && "hidden", { "px-4": true })).toBe("py-1 px-4");
  });
});
