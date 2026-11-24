import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Sample data is fake and unshaped: it must not reach a real screen. Only the design review page and the sample folder itself
// may import it. Everything else (screens, components, server code, shared logic) is checked here.
const ROOT = process.cwd();
const ALLOWED = [join("app", "dev") + sep, join("lib", "sample") + sep];
const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return walk(path);
    return SOURCE.test(name) && !TEST.test(name) ? [path] : [];
  });
}

describe("sample data isolation", () => {
  it("is imported only by the design review page", () => {
    const offenders = ["app", "components", "lib", "server"]
      .flatMap((directory) => walk(join(ROOT, directory)))
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED.some((prefix) => path.startsWith(prefix)))
      .filter((path) => /from\s+["'](@\/lib\/sample|\.{1,2}\/[^"']*sample)[^"']*["']/.test(readFileSync(join(ROOT, path), "utf8")));
    expect(offenders).toEqual([]);
  });
});
