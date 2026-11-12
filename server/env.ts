import { z } from "zod";
import { ROLE_NAMES, RUNTIME_ROLES, passwordVariable, urlVariable } from "@/server/db/roles";

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

const postgresUrl = z.string().refine(isPostgresUrl, "must be a postgres:// or postgresql:// URL");
const origin = z.string().refine(isOrigin, "must be an http:// or https:// origin, with no path and no trailing slash");
/** A variable left empty in an env file counts as not set. */
const emptyAsMissing = (value: unknown): unknown => (value === "" ? undefined : value);
const password = z.string().min(24, "must be at least 24 characters");

/**
 * What the running app needs: one connection string per runtime role (the owner role is never in the app), the secret
 * that signs sessions, and the origin the app is served from.
 */
export const runtimeEnvSchema = z
  .object({
    DATABASE_URL_AUTH: postgresUrl,
    DATABASE_URL_FYNIX: postgresUrl,
    DATABASE_URL_CLIENT: postgresUrl,
    DATABASE_URL_AGENCY: postgresUrl,
    DATABASE_URL_PUBLIC: postgresUrl,
    /** Signs the session cookie. A shorter one is refused here and again in createAuth, because Better Auth only warns. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    APP_ORIGIN: origin,
    /** `off` skips the breached-password check, for development without a network. Unset means `hibp`. */
    PASSWORD_BREACH_CHECK: z.preprocess(emptyAsMissing, z.enum(["hibp", "off"]).optional()),
  })
  .refine((env) => !(env.PASSWORD_BREACH_CHECK === "off" && env.APP_ORIGIN.startsWith("https://")), {
    path: ["PASSWORD_BREACH_CHECK"],
    message: "off is not allowed on an https deployment",
  })
  // Better Auth only marks cookies Secure when the origin is https. Read from process.env: Next.js always sets NODE_ENV.
  .refine((env) => !(process.env.NODE_ENV === "production" && env.APP_ORIGIN.startsWith("http://")), {
    path: ["APP_ORIGIN"],
    message: "must be an https:// origin in production, so session cookies are Secure",
  });
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

/**
 * What the scripts and integration tests need on top of that: a superuser URL to create roles and databases, the
 * owner URL for migrations, a password per role, and the same connection strings for the test database.
 */
export const toolingEnvSchema = z.object({
  DATABASE_URL_ADMIN: postgresUrl,
  DATABASE_URL_OWNER: postgresUrl,
  DATABASE_URL_OWNER_TEST: postgresUrl,
  DATABASE_URL_AUTH_TEST: postgresUrl,
  DATABASE_URL_FYNIX_TEST: postgresUrl,
  DATABASE_URL_CLIENT_TEST: postgresUrl,
  DATABASE_URL_AGENCY_TEST: postgresUrl,
  DATABASE_URL_PUBLIC_TEST: postgresUrl,
  LEADS_OWNER_PASSWORD: password,
  LEADS_AUTH_PASSWORD: password,
  LEADS_FYNIX_PASSWORD: password,
  LEADS_CLIENT_PASSWORD: password,
  LEADS_AGENCY_PASSWORD: password,
  LEADS_PUBLIC_PASSWORD: password,
});
export type ToolingEnv = z.infer<typeof toolingEnvSchema>;

/** The variable names the two schemas declare, for the check that roles.ts and this file agree. */
export function declaredVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  return { runtime: Object.keys(runtimeEnvSchema.shape), tooling: Object.keys(toolingEnvSchema.shape) };
}

/** The variable names roles.ts derives, for the same check. */
export function derivedVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  const runtime = [...RUNTIME_ROLES.map((role) => urlVariable(role, "dev")), "BETTER_AUTH_SECRET", "APP_ORIGIN", "PASSWORD_BREACH_CHECK"];
  const tooling = [
    "DATABASE_URL_ADMIN",
    urlVariable("leads_owner", "dev"),
    ...ROLE_NAMES.map((role) => urlVariable(role, "test")),
    ...ROLE_NAMES.map((role) => passwordVariable(role)),
  ];
  return { runtime, tooling };
}

type Source = Readonly<Record<string, string | undefined>>;

/**
 * One line per problem, naming the variable and the rule it broke, never its value: env values here are passwords.
 * An empty list means the environment is complete.
 */
export function describeEnvProblems(source: Source, schema: z.ZodObject): string[] {
  const result = schema.safeParse(source);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "(unknown)");
    const value = source[name];
    return value === undefined || value === "" ? `${name}: missing` : `${name}: invalid, ${issue.message}`;
  });
}

let runtimeEnv: RuntimeEnv | undefined;

/**
 * The runtime environment, parsed on first use and not at import time, so `next build` and unit tests need no
 * secrets. Throws a message that names the failing variables and never their values.
 */
export function getEnv(source: Source = process.env): RuntimeEnv {
  if (runtimeEnv !== undefined) return runtimeEnv;
  const problems = describeEnvProblems(source, runtimeEnvSchema);
  if (problems.length > 0) {
    throw new Error(`The environment is not valid. Run "pnpm env:check" to see it again.\n${problems.join("\n")}`);
  }
  runtimeEnv = runtimeEnvSchema.parse(source);
  return runtimeEnv;
}

/** The tooling environment, for scripts and tests. Not cached: scripts load their env file just before calling this. */
export function getToolingEnv(source: Source = process.env): ToolingEnv {
  const problems = describeEnvProblems(source, toolingEnvSchema);
  if (problems.length > 0) {
    throw new Error(`The environment is not valid. Run "pnpm env:init" for a new machine or "pnpm env:check".\n${problems.join("\n")}`);
  }
  return toolingEnvSchema.parse(source);
}

/** Test hook: forget the cached runtime environment. */
export function resetEnvCache(): void {
  runtimeEnv = undefined;
}
