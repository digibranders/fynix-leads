import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASES, ROLE_NAMES, passwordVariable, urlVariable } from "@/server/db/roles";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { declaredVariables, derivedVariables, describeEnvProblems, getToolingEnv, runtimeEnvSchema, toolingEnvSchema } from "@/server/env";

/** A complete environment, built the way `pnpm env:init` builds it. */
function completeEnvironment(): Record<string, string> {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  return Object.fromEntries(entries);
}

describe("APP_ORIGIN in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses an http origin, naming the variable and not its value", () => {
    vi.stubEnv("NODE_ENV", "production");
    const environment = { ...completeEnvironment(), APP_ORIGIN: "http://leads.internal.example" };
    const problems = describeEnvProblems(environment, runtimeEnvSchema);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^APP_ORIGIN: invalid, .*https/);
    expect(problems.join("\n")).not.toContain("leads.internal.example");
  });

  it("accepts an https origin in production and http localhost in development and test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "https://leads.example.com", BREVO_API_KEY: "xkeysib-test-0123456789abcdef" }, runtimeEnvSchema)).toEqual([]);
    for (const mode of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", mode);
      expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "http://localhost:3020" }, runtimeEnvSchema), mode).toEqual([]);
    }
  });
});

describe("environment schemas", () => {
  it("accepts the environment that env:init writes", () => {
    const environment = completeEnvironment();
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems(environment, toolingEnvSchema)).toEqual([]);
    expect(getToolingEnv(environment).DATABASE_URL_OWNER).toContain("leads_owner");
  });

  it("declares exactly the variable names that roles.ts derives", () => {
    const declared = declaredVariables();
    const derived = derivedVariables();
    expect([...declared.runtime].sort()).toEqual([...derived.runtime].sort());
    expect([...declared.tooling].sort()).toEqual([...derived.tooling].sort());
  });

  it("reports a missing variable by name only", () => {
    const environment = completeEnvironment();
    delete environment.DATABASE_URL_CLIENT;
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual(["DATABASE_URL_CLIENT: missing"]);
  });

  it("reports an invalid variable by name and rule, never by value", () => {
    const environment = { ...completeEnvironment(), DATABASE_URL_AGENCY_TEST: "mysql://secret-user:secret-pass@host/db", LEADS_AUTH_PASSWORD: "short" };
    const problems = describeEnvProblems(environment, toolingEnvSchema).join("\n");
    expect(problems).toContain("DATABASE_URL_AGENCY_TEST: invalid, must be a postgres:// or postgresql:// URL");
    expect(problems).toContain("LEADS_AUTH_PASSWORD: invalid, must be at least 24 characters");
    expect(problems).not.toContain("secret-pass");
    expect(problems).not.toContain("short\n");
  });

  it("throws from getToolingEnv with names and no values", () => {
    const environment = { ...completeEnvironment(), LEADS_OWNER_PASSWORD: "hunter2" };
    let message = "";
    try {
      getToolingEnv(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("LEADS_OWNER_PASSWORD");
    expect(message).not.toContain("hunter2");
  });
});

describe("generated environment file", () => {
  it("gives every role its own random password and uses them in the URLs", () => {
    const secrets = generateSecrets("tester");
    const passwords = ROLE_NAMES.map((role) => secrets.passwords[role]);
    expect(new Set(passwords).size).toBe(ROLE_NAMES.length);
    expect(passwords.every((value) => /^[0-9a-f]{48}$/.test(value))).toBe(true);
    const file = buildEnvFile(secrets);
    for (const role of ROLE_NAMES) {
      expect(file).toContain(`${passwordVariable(role)}=${secrets.passwords[role]}`);
      expect(file).toContain(`${urlVariable(role, "test")}=postgresql://${role}:${secrets.passwords[role]}@localhost:5432/${DATABASES.test}`);
    }
  });

  it("keeps the owner out of the runtime variables", () => {
    const runtimeLines = buildEnvFile(generateSecrets("tester"))
      .split("\n")
      .filter((line) => /^DATABASE_URL_(AUTH|FYNIX|CLIENT|AGENCY|PUBLIC)=/.test(line));
    expect(runtimeLines).toHaveLength(5);
    expect(runtimeLines.some((line) => line.includes("leads_owner"))).toBe(false);
  });

  it("is safe to load unquoted: no whitespace, quotes, hash or dollar in any value", () => {
    for (const line of buildEnvFile(generateSecrets("tester")).split("\n").filter((l) => l !== "" && !l.startsWith("#"))) {
      expect(line.slice(line.indexOf("=") + 1)).toMatch(/^[^\s"'#$]+$/);
    }
  });
});

describe(".env.example", () => {
  it("lists exactly the variables the schemas declare, and holds no values", () => {
    const lines = readFileSync(join(process.cwd(), ".env.example"), "utf8").split("\n").filter((line) => /^[A-Z_]+=/.test(line));
    expect(lines.map((line) => line.slice(0, line.indexOf("="))).sort()).toEqual([...declaredVariables().runtime, ...declaredVariables().tooling].sort());
    expect(lines.every((line) => line.endsWith("="))).toBe(true);
  });
});
