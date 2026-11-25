import { describe, expect, it } from "vitest";
import { exportHref } from "@/components/kit/export-button";

describe("exportHref", () => {
  it("is the bare file when nothing narrows it", () => {
    expect(exportHref("leads", null)).toBe("/api/export/leads");
  });

  it("carries the campaign, the source agency, or both", () => {
    expect(exportHref("leads", "c1")).toBe("/api/export/leads?campaign=c1");
    expect(exportHref("leads", null, "a1")).toBe("/api/export/leads?source=a1");
    expect(exportHref("meetings", "c 1", "a1")).toBe("/api/export/meetings?campaign=c%201&source=a1");
  });
});
