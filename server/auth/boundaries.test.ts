import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level rules that keep the auth design from being undone by accident. They read files, not the database. */

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

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);
const everything = (): string[] => ["server", "scripts", "app", "components", "lib"].flatMap(sourceFiles);

describe("Better Auth stays inside server/auth", () => {
  it("is imported only from server/auth", () => {
    const offenders = everything().filter((path) => !path.startsWith(join("server", "auth")) && /from\s+["']better-auth/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("is pinned to an exact version", () => {
    const pinned: unknown = (JSON.parse(read("package.json")) as { dependencies?: Record<string, unknown> }).dependencies?.["better-auth"];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has no HTTP route: nothing serves its handler, so sign-in can only go through the guarded server code", () => {
    const offenders = everything().filter((path) => !isTest(path) && /toNextJsHandler|auth\.handler|\.handler\(/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(everything().filter((path) => path.startsWith(join("app", "api", "auth")))).toEqual([]);
  });

  it("is never configured to share cookies across hosts or to skip its origin checks", () => {
    const config = read("server/auth/create-auth.ts");
    for (const forbidden of ["crossSubDomainCookies", "disableCSRFCheck", "disableOriginCheck", "disableIpTracking"]) {
      expect(config, forbidden).not.toContain(forbidden);
    }
  });
});

describe("pages stay thin", () => {
  /** The only server modules a page or a client form may import: the actions, the session read and the page guard. */
  const ALLOWED_SERVER_IMPORTS: ReadonlySet<string> = new Set(["@/server/auth", "@/server/auth/actions", "@/server/auth/guard"]);
  const pageFiles = (): string[] => ["app/(auth)", "app/(app)"].filter((directory) => existsSync(join(ROOT, directory))).flatMap(sourceFiles);
  const serverImports = (path: string): string[] => [...read(path).matchAll(/from\s+["'](@\/server[^"']*)["']/g)].map((match) => match[1] ?? "");

  it("import from server/ only the actions, the session read and the guard: never the database, Better Auth, the limiter or the breach check", () => {
    const offenders = pageFiles().flatMap((path) => serverImports(path).filter((name) => !ALLOWED_SERVER_IMPORTS.has(name)).map((name) => `${path} imports ${name}`));
    expect(offenders).toEqual([]);
  });

  it("never import better-auth or drizzle directly, and never log", () => {
    const offenders = pageFiles().filter((path) => /from\s+["'](better-auth|drizzle-orm|pg)["/]/.test(read(path)) || /console\.(log|info|debug)\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("files that reach a database pool", () => {
  it("server/auth/index.ts, guard.ts and with-session.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/auth/index.ts", "server/auth/guard.ts", "server/auth/with-session.ts"]) expect(read(path), path).toMatch(/^import "server-only";/m);
  });

  it("the actions file is a use server module that exports only async functions, because every export is a public endpoint", () => {
    const source = read("server/auth/actions.ts");
    expect(source.startsWith('"use server";')).toBe(true);
    const exports = source.split("\n").filter((line) => line.startsWith("export "));
    expect(exports.length).toBeGreaterThan(0);
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });

  it("only server/auth/index.ts and scripts open the leads_auth, leads_public or owner pools", () => {
    const offenders = everything()
      .filter((path) => !isTest(path) && path !== join("server", "auth", "index.ts") && !path.startsWith("scripts") && !path.startsWith(join("server", "db")))
      .filter((path) => /getDatabase\(\s*["']leads_(auth|public|owner)["']/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});
