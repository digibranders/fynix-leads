import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level rules that keep the database design from being undone by accident. They read files, not the database.
 */

const ROOT = process.cwd();

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(join(ROOT, directory))) {
    const path = join(directory, name);
    if (statSync(join(ROOT, path)).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

describe("lib/ stays pure domain code", () => {
  it("imports nothing from server/ and no database driver", () => {
    const offenders = sourceFiles("lib")
      .filter((path) => !isTest(path))
      .filter((path) => /from\s+["'](@\/server\/|drizzle-orm|pg["'/])/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("tenant queries name their columns", () => {
  it("no source file outside tests and the test harness calls .select() with no column list", () => {
    const offenders = ["server", "app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((path) => !isTest(path) && !path.startsWith(join("server", "db", "testing")))
      .filter((path) => /\.select\(\s*\)/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("files that open connections", () => {
  it("client.ts and scope.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/db/client.ts", "server/db/scope.ts"]) {
      expect(read(path), path).toMatch(/^import "server-only";/m);
    }
  });
});

describe("copy rule", () => {
  it("server/, scripts/ and the migrations contain no em or en dashes", () => {
    const files = [...sourceFiles("server"), ...sourceFiles("scripts"), "drizzle.config.ts"];
    const sql = readdirSync(join(ROOT, "server/db/migrations")).filter((name) => name.endsWith(".sql")).map((name) => join("server/db/migrations", name));
    // The pattern is spelled with escapes so this file does not contain the characters it forbids.
    expect([...files, ...sql].filter((path) => /[\u2013\u2014]/.test(read(path)))).toEqual([]);
  });
});
