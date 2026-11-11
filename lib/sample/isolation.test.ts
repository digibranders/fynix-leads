import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewQueue } from "@/lib/review/queue";
import { INITIAL_PENDING_COUNT } from "@/lib/review/initial-pending";
import { SAMPLE_LEADS } from "./data";

/** Every component and every non-test lib module may reach an agency browser. lib/sample/data holds the client rep names, so none of them may import it. */
const SHARED_MODULES = ["components", "lib"].flatMap((dir) =>
  readdirSync(join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
    .map((file) => join(dir, file))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.startsWith(join("lib", "sample"))),
);

describe("agency isolation of shared client code", () => {
  it.each(SHARED_MODULES)("%s does not import the full sample data", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/sample\/data["']/);
  });

  it("finds the modules it is meant to guard", () => {
    expect(SHARED_MODULES).toContain(join("components", "shell", "rail.tsx"));
    expect(SHARED_MODULES).toContain(join("lib", "review", "pending-store.ts"));
    expect(SHARED_MODULES.some((file) => file.startsWith(join("lib", "sample")))).toBe(false);
  });

  it("keeps the initial pending count in step with the sample data", () => {
    expect(INITIAL_PENDING_COUNT).toBe(reviewQueue(SAMPLE_LEADS).length);
  });
});
