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
/** A well-formed Brevo key for the tests that need an https origin to be valid. Not a real key. */
const BREVO_KEY = "xkeysib-test-0123456789abcdef";

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
    expect(problems({ ...environment(), APP_ORIGIN: value, BREVO_API_KEY: BREVO_KEY })).toEqual(["APP_ORIGIN: invalid, must be an http:// or https:// origin, with no path and no trailing slash"]);
  });

  it("accepts https and http origins", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: BREVO_KEY })).toEqual([]);
    expect(problems({ ...environment(), APP_ORIGIN: "http://app.localhost:3020" })).toEqual([]);
  });

  it("treats an empty PASSWORD_BREACH_CHECK as unset, and refuses an unknown value", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "maybe" })).toHaveLength(1);
  });

  it("allows the breach check to be off on http and refuses it on https", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off", APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: BREVO_KEY })).toEqual([
      "PASSWORD_BREACH_CHECK: invalid, off is not allowed on an https deployment",
    ]);
  });
});

describe("the email key", () => {
  it("is optional on http: development without a key only writes the outbox", () => {
    expect(problems(environment())).toEqual([]);
    expect(problems({ ...environment(), BREVO_API_KEY: "" })).toEqual([]);
  });

  it("is required on an https deployment, so a production start-up without one is refused", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([
      "BREVO_API_KEY: missing",
    ]);
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: "" })).toEqual(["BREVO_API_KEY: missing"]);
  });

  it("names a key that is too short and never prints it", () => {
    const result = problems({ ...environment(), BREVO_API_KEY: "short-key" });
    expect(result).toEqual(["BREVO_API_KEY: invalid, must be at least 20 characters"]);
    expect(result.join("")).not.toContain("short-key");
  });

  it("env:init leaves the key out, as a comment for the person to fill in", () => {
    expect(buildEnvFile(generateSecrets("tester"))).toContain("# BREVO_API_KEY=");
    expect(environment().BREVO_API_KEY).toBeUndefined();
  });
});
