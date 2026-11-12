import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBreachChecker } from "@/server/auth/testing";
import { assertUsableSecret, createAuth, MIN_SECRET_LENGTH } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";

const RANDOM_SECRET = "d41d8cd98f00b204e9800998ecf8427e5a3b7c9d1e2f4a6b8c0d2e4f6a8b0c1d";
/** Never used: the guards under test throw before anything touches the database. */
const NO_DATABASE = {} as unknown as Database;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guard 3: the auth secret", () => {
  it("accepts a random secret of 32 characters or more", () => {
    expect(() => assertUsableSecret("x".repeat(MIN_SECRET_LENGTH))).not.toThrow();
    expect(() => assertUsableSecret(RANDOM_SECRET)).not.toThrow();
  });

  it.each(["", "short", "x".repeat(MIN_SECRET_LENGTH - 1)])("refuses %j, which Better Auth would only warn about", (secret) => {
    expect(() => assertUsableSecret(secret)).toThrow("at least 32 characters");
  });

  it("refuses Better Auth's published default even though it is longer than 32 characters", () => {
    expect(() => assertUsableSecret("better-auth-secret-12345678901234567890")).toThrow("public default");
  });

  it("refuses to start while BETTER_AUTH_SECRETS is set, because Better Auth would use it instead", () => {
    vi.stubEnv("BETTER_AUTH_SECRETS", "1:something-else-entirely-0123456789abcdef");
    expect(() => assertUsableSecret(RANDOM_SECRET)).toThrow("BETTER_AUTH_SECRETS");
  });

  it("createAuth applies it before it builds anything", () => {
    const config = { db: NO_DATABASE, baseURL: "http://localhost:3020", breachChecker: new FakeBreachChecker(), mailer: { sendPasswordReset: async () => undefined }, nextCookies: false };
    expect(() => createAuth({ ...config, secret: "x".repeat(31) })).toThrow("at least 32 characters");
    expect(() => createAuth({ ...config, secret: "" })).toThrow("at least 32 characters");
  });
});

describe("secure cookies", () => {
  const config = { db: NO_DATABASE, secret: RANDOM_SECRET, baseURL: "http://localhost:3020", breachChecker: new FakeBreachChecker(), mailer: { sendPasswordReset: async () => undefined }, nextCookies: false };

  it("forces Secure cookies in production, whatever the origin scheme looks like", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(createAuth(config).options.advanced?.useSecureCookies).toBe(true);
  });

  it("leaves it to the origin scheme outside production, so http localhost works", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(createAuth(config).options.advanced?.useSecureCookies).toBeFalsy();
  });
});
