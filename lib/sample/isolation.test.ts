import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewQueue } from "@/lib/review/queue";
import { INITIAL_PENDING_COUNT } from "@/lib/review/initial-pending";
import { SAMPLE_LEADS } from "./data";

/** Files that ship to every role's browser. lib/sample/data holds the client rep names, so none of them may import it. */
const SHARED_CLIENT_MODULES = [
  "components/shell/nav-config.ts",
  "components/shell/rail.tsx",
  "components/shell/command-search.tsx",
  "components/shell/app-shell.tsx",
  "lib/review/pending-store.ts",
  "lib/review/use-pending-count.ts",
];

describe("agency isolation of shared client code", () => {
  it.each(SHARED_CLIENT_MODULES)("%s does not import the full sample data", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/sample\/data["']/);
  });

  it("keeps the initial pending count in step with the sample data", () => {
    expect(INITIAL_PENDING_COUNT).toBe(reviewQueue(SAMPLE_LEADS).length);
  });
});
