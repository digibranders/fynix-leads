import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A "use server" file may only export async functions (and types, which are erased). Exporting a constant from one makes Next.js
 * refuse to load every action in the file the first time a form posts to it, and the page shows "Something went wrong". The build
 * does not catch it, so this does.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".git"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("use server files", () => {
  it("export nothing but async functions and types", () => {
    const offenders = ["app", "components", "lib", "server"]
      .flatMap((directory) => sourceFiles(join(ROOT, directory)))
      .filter((path) => /^\s*["']use server["']/.test(readFileSync(path, "utf8")))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => /^export\s+(const|let|var|class|enum|default\s+(?!async))/.test(line))
          .map((line) => `${path.replace(ROOT, "")}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
