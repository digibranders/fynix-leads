import { describe, expect, it } from "vitest";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { describeEnvProblems, runtimeEnvSchema } from "@/server/env";

/** The environment `pnpm env:init` writes, which the phase 1B variables are part of. */
function environment(): Record<string, string> {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  return Object.fromEntries(entries);
}

const problems = (source: Record<string, string>): string[] => describeEnvProblems(source, runtimeEnvSchema);

describe("the sign-in variables", () => {
  it("env:init writes a 64 character secret, a local origin and the breach check on", () => {
    const env = environment();
    expect(env.BETTER_AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(env.APP_ORIGIN).toBe("http://localhost:3020");
    expect(env.PASSWORD_BREACH_CHECK).toBe("hibp");
    expect(problems(env)).toEqual([]);
  });

  it("names a secret under 32 characters and never prints it", () => {
    const result = problems({ ...environment(), BETTER_AUTH_SECRET: "x".repeat(31) });
    expect(result).toEqual(["BETTER_AUTH_SECRET: invalid, must be at least 32 characters"]);
  });

  it.each(["https://leads.fynix.digital/", "https://leads.fynix.digital/app", "leads.fynix.digital", "ftp://leads.fynix.digital"])("refuses the origin %s", (value) => {
    expect(problems({ ...environment(), APP_ORIGIN: value })).toEqual(["APP_ORIGIN: invalid, must be an http:// or https:// origin, with no path and no trailing slash"]);
  });

  it("accepts https and http origins", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([]);
    expect(problems({ ...environment(), APP_ORIGIN: "http://app.localhost:3020" })).toEqual([]);
  });

  it("treats an empty PASSWORD_BREACH_CHECK as unset, and refuses an unknown value", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "maybe" })).toHaveLength(1);
  });

  it("allows the breach check to be off on http and refuses it on https", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off", APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([
      "PASSWORD_BREACH_CHECK: invalid, off is not allowed on an https deployment",
    ]);
  });
});
