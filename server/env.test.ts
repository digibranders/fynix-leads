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
    const lines = readFileSync(join(process.cwd(), ".env.example"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Z0-9_]+=/.test(line));
    expect(lines.map((line) => line.slice(0, line.indexOf("="))).sort()).toEqual([...declaredVariables().runtime, ...declaredVariables().tooling].sort());
    expect(lines.every((line) => line.endsWith("="))).toBe(true);
  });
});

describe("the phase 6 switches", () => {
  it("are all optional, and the app starts with none of them set", () => {
    const environment = completeEnvironment();
    for (const name of ["LAUNCH_EMAILS_ENABLED", "MAIL_SENDER_ADDRESS", "MAIL_SENDER_NAME", "MEET_PROVIDER", "GOOGLE_MEET_CLIENT_ID", "GOOGLE_MEET_CLIENT_SECRET", "GOOGLE_MEET_REFRESH_TOKEN"]) expect(environment[name]).toBeUndefined();
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems({ ...environment, LAUNCH_EMAILS_ENABLED: "false", MEET_PROVIDER: "none" }, runtimeEnvSchema)).toEqual([]);
  });

  it("accept the launch emails with the default Fynix sender: prospect letters are held back elsewhere, not by the environment", () => {
    const environment = { ...completeEnvironment(), LAUNCH_EMAILS_ENABLED: "true" };
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems({ ...environment, MAIL_SENDER_ADDRESS: "hello@fynix.digital" }, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems({ ...environment, MAIL_SENDER_ADDRESS: "not an address" }, runtimeEnvSchema)).toHaveLength(1);
  });

  it("refuse google rooms without the three Google variables, and values that are not one of the words", () => {
    const environment = { ...completeEnvironment(), MEET_PROVIDER: "google" };
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual([expect.stringMatching(/^MEET_PROVIDER: invalid, .*GOOGLE_MEET_CLIENT_ID/)]);
    expect(describeEnvProblems({ ...environment, GOOGLE_MEET_CLIENT_ID: "client-id-0123", GOOGLE_MEET_CLIENT_SECRET: "client-secret-0123", GOOGLE_MEET_REFRESH_TOKEN: "refresh-0123456" }, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems({ ...completeEnvironment(), MEET_PROVIDER: "zoom" }, runtimeEnvSchema)).toHaveLength(1);
    expect(describeEnvProblems({ ...completeEnvironment(), LAUNCH_EMAILS_ENABLED: "yes" }, runtimeEnvSchema)).toHaveLength(1);
  });
});
