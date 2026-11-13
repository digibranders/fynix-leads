import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level rules that keep the domain layer's guarantees from being undone by accident. They read files, not the database. */

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !isTest(path) ? [path] : [];
  });
}
const domainFiles = (): string[] => sourceFiles("server/domain").filter((path) => path !== join("server", "domain", "testing.ts") && path !== join("server", "domain", "test-helpers.ts"));
const everything = (): string[] => ["server", "scripts", "lib"].flatMap(sourceFiles);

describe("every Fynix write goes through one helper", () => {
  it("withScope and withFynixScope are called only by the scope helper, the session helper, the Fynix write helper and the test harness", () => {
    const allowed = new Set([join("server", "db", "scope.ts"), join("server", "auth", "with-session.ts"), join("server", "domain", "fynix-write.ts"), join("server", "db", "testing", "index.ts")]);
    const offenders = everything().filter((path) => !allowed.has(path) && /\bwith(Fynix)?Scope\s*\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("no domain service opens a transaction of its own, apart from the reference savepoint and the redemption, which names an invite", () => {
    const allowed = new Set([join("server", "domain", "refs.ts"), join("server", "domain", "redeem-invite.ts")]);
    const offenders = domainFiles().filter((path) => !allowed.has(path) && /\.transaction\s*\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("the services that change data as Fynix call fynixWrite", () => {
    for (const path of ["organisations", "campaigns", "invites", "members", "terms", "suppliers", "agreements", "shares", "hosts", "availability"]) expect(read(`server/domain/${path}.ts`), path).toContain("fynixWrite(");
  });

  it("no service writes the audit table directly: only appendAudit does", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "audit.ts") && /insert\(\s*auditLog\s*\)/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("what scripts may load", () => {
  it("the mail and placeholder modules scripts import do not import server-only code", () => {
    for (const path of ["server/mail/outbox.ts", "server/mail/brevo.ts", "server/mail/transport.ts", "server/domain/placeholder-terms.ts"]) {
      const source = read(path);
      expect(source, path).not.toMatch(/from\s+["']server-only["']|import\s+["']server-only["']/);
      expect(source, path).not.toMatch(/@\/server\/db\/(scope|client)["']/);
    }
  });

  it("only server/domain/index.ts and page-data.ts among the domain files import server-only", () => {
    const allowed = new Set([join("server", "domain", "index.ts"), join("server", "domain", "page-data.ts")]);
    const offenders = domainFiles().filter((path) => !allowed.has(path) && /import\s+["']server-only["']/.test(read(path)));
    expect(offenders).toEqual([]);
    for (const path of allowed) expect(read(path), path).toMatch(/^import "server-only";/m);
  });

  it("the actions file is a use server module that exports only async functions, because every export is a public endpoint", () => {
    const source = read("server/domain/actions.ts");
    expect(source.startsWith('"use server";')).toBe(true);
    const exports = source.split("\n").filter((line) => line.startsWith("export "));
    expect(exports.length).toBeGreaterThan(0);
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });
});

describe("secrets stay out of places they must not be", () => {
  it("no domain or mail file logs, except the action, which logs an error's name and never its message", () => {
    const offenders = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => path !== join("server", "domain", "actions.ts") && /console\.(log|info|debug|warn|error)\(/.test(read(path)));
    expect(offenders).toEqual([]);
    const logged = read("server/domain/actions.ts").match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const call of logged) expect(call, call).toMatch(/error instanceof Error \? error\.name : "unknown error"/);
  });

  it("only the invite and redeem services and the outbox know the invite link path, and only the outbox sender reads the link column", () => {
    const readers = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => /emailOutbox\.link\b/.test(read(path)));
    expect(readers.sort()).toEqual([join("server", "mail", "outbox.ts")]);
  });

  it("the invite token is generated and hashed in one module", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "invite-token.ts") && /createHash\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("the Brevo key is read from the environment in the wiring and the outbox script only", () => {
    const offenders = everything().filter((path) => /BREVO_API_KEY/.test(read(path)) && ![join("server", "env.ts"), join("server", "domain", "index.ts"), join("scripts", "outbox-run.ts")].includes(path) && !path.endsWith("env-init.ts"));
    expect(offenders).toEqual([]);
  });
});
