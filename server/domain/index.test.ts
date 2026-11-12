import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabases } from "@/server/db/client";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { resetEnvCache } from "@/server/env";

function stubEnvironment(overrides: Record<string, string>): void {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  for (const [name, value] of [...entries, ...Object.entries(overrides)]) vi.stubEnv(name, value);
}

beforeEach(() => resetEnvCache());
afterEach(async () => {
  await closeDatabases();
  vi.unstubAllEnvs();
  resetEnvCache();
  // The module keeps its dependencies once built; a fresh import gives the next test its own.
  vi.resetModules();
});

describe("getDomain", () => {
  it("allows placeholder terms on an http origin, which is development", async () => {
    stubEnvironment({});
    const { getDomain: fresh } = await import("@/server/domain");
    const deps = fresh();
    expect(deps.origin).toBe("http://localhost:3020");
    expect(deps.allowPlaceholderTerms).toBe(true);
    expect(deps.randomBytes(8)).toHaveLength(8);
    expect(Math.abs(deps.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("gate G2: refuses placeholder terms on an https origin", async () => {
    stubEnvironment({ APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: "xkeysib-test-0123456789abcdef" });
    const { getDomain: fresh } = await import("@/server/domain");
    expect(fresh().allowPlaceholderTerms).toBe(false);
  });

  it("opens the Fynix, identity and public pools and builds a Better Auth instance on a database it is given", async () => {
    stubEnvironment({});
    const { getDomain: fresh } = await import("@/server/domain");
    const deps = fresh();
    expect(new Set([deps.fynixDb, deps.authDb, deps.publicDb]).size).toBe(3);
    expect(typeof deps.authFactory(deps.authDb).api.signUpEmail).toBe("function");
    expect(fresh()).toBe(deps);
  });
});

describe("getMailTransport", () => {
  it("is null without a Brevo key, so development only writes the outbox", async () => {
    stubEnvironment({});
    const { getMailTransport: fresh } = await import("@/server/domain");
    expect(fresh()).toBeNull();
  });

  it("is the Brevo transport with a key", async () => {
    stubEnvironment({ BREVO_API_KEY: "xkeysib-test-0123456789abcdef" });
    const { getMailTransport: fresh } = await import("@/server/domain");
    expect(typeof fresh()?.send).toBe("function");
  });
});
