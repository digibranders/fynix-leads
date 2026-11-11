import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queueSegments } from "@/lib/review/queue";
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
    expect(INITIAL_PENDING_COUNT).toBe(queueSegments(SAMPLE_LEADS).waiting.length);
  });
});

const ROOT = process.cwd();
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".git", ".claude", ".agents", "docs", "public", "coverage"]);
const IMPORTS_DATA = /sample\/data["']|from\s+["']\.\/data["']/;

/** Every ts or tsx file in the repo that is not a test, a dependency or build output. */
function sourceFiles(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(join(dir, entry.name));
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [join(dir, entry.name)] : [];
  });
}

const ALL_SOURCE = sourceFiles().map((file) => file.slice(ROOT.length + 1));
const isClientFile = (source: string): boolean => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use client["']/.test(source);

describe("the full sample data stays on the server", () => {
  const clientFiles = ALL_SOURCE.filter((file) => isClientFile(readFileSync(join(ROOT, file), "utf8")));

  it("finds the client files it is meant to guard, including ones outside components", () => {
    expect(clientFiles).toContain(join("components", "review", "review-queue.tsx"));
    expect(clientFiles).toContain(join("app", "error.tsx"));
  });

  it.each(clientFiles)("client file %s does not import the full sample data", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(IMPORTS_DATA);
  });

  it("only server pages and layouts under app import the data, never loading, error or template files", () => {
    const importers = ALL_SOURCE.filter((file) => IMPORTS_DATA.test(readFileSync(join(ROOT, file), "utf8")) && !file.startsWith(join("lib", "sample")));
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) {
      expect(file.startsWith("app")).toBe(true);
      expect(file).toMatch(/(?:page|layout)\.tsx$/);
    }
  });

  it("marks the data module server-only", () => {
    expect(readFileSync(join(ROOT, "lib", "sample", "data.ts"), "utf8")).toMatch(/^import "server-only";/m);
  });
});
