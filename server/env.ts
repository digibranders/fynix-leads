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
    /**
     * The Brevo API key that sends the email queued in `email_outbox`. Optional on http: without it development only
     * writes the outbox. An https deployment refuses to start without one (the refinement below).
     */
    BREVO_API_KEY: z.preprocess(emptyAsMissing, z.string().min(20, "must be at least 20 characters").optional()),
    /**
     * The master switch of the launch emails (phase 6: every email of the Meet note's table, prospect letters included). Off unless it is `true`: then the app sends the
     * invite, the password reset and the alias code exactly as before and queues nothing else. `true` needs a neutral sender address (below).
     */
    LAUNCH_EMAILS_ENABLED: z.preprocess(emptyAsMissing, z.enum(["true", "false"]).optional()),
    /** The address every message goes out from. Unset means hello@fynix.digital, as today. The neutral domain's address goes here at the switch (gate G3). */
    MAIL_SENDER_ADDRESS: z.preprocess(emptyAsMissing, z.string().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "must be an email address").optional()),
    /** The display name of that address. Unset means "Fynix" with the default address, or the address itself with another one. */
    MAIL_SENDER_NAME: z.preprocess(emptyAsMissing, z.string().min(1).max(70).optional()),
    /**
     * Gate G1. `true` makes every Fynix person turn on the second sign-in step (an authenticator app) before any other Fynix page opens; they are sent to their profile
     * page to do it. Anything else is off, so a deploy never locks anyone out. Turn it on only once every Fynix person has enrolled.
     */
    REQUIRE_FYNIX_2FA: z.preprocess(emptyAsMissing, z.enum(["true", "false"]).optional()),
    /** Where meeting rooms come from. `none` (the default): no room is made and the screens say the link will follow. `google`: the Meet REST API with the three variables below. */
    MEET_PROVIDER: z.preprocess(emptyAsMissing, z.enum(["none", "google"]).optional()),
    /** The OAuth client and the refresh token of the one neutral room account (the Meet note, "What the owner arranges", step 5). */
    GOOGLE_MEET_CLIENT_ID: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    GOOGLE_MEET_CLIENT_SECRET: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    GOOGLE_MEET_REFRESH_TOKEN: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    /**
     * Calendar connection (calendar spec of 2026-11-26, section 8). `true` shows Connect calendar to client people and runs the calendar sync step; anything else is
     * off: no Connect button, no sync, no call to Google or Microsoft, and the calendar runs on typed hours. Needs CALENDAR_TOKEN_KEY and at least one provider's pair.
     */
    CALENDAR_SYNC_ENABLED: z.preprocess(emptyAsMissing, z.enum(["true", "false"]).optional()),
    /** 32 random bytes, base64 or base64url. Encrypts the refresh tokens and signs the sign-in state. Generate with: openssl rand -base64 32 */
    CALENDAR_TOKEN_KEY: z.preprocess(emptyAsMissing, z.string().regex(/^[A-Za-z0-9+/_-]{43}=?$/, "must be 32 random bytes as base64 (openssl rand -base64 32)").optional()),
    GOOGLE_CALENDAR_CLIENT_ID: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    GOOGLE_CALENDAR_CLIENT_SECRET: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    MICROSOFT_CALENDAR_CLIENT_ID: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
    MICROSOFT_CALENDAR_CLIENT_SECRET: z.preprocess(emptyAsMissing, z.string().min(10).optional()),
  })
  .refine((env) => !(env.PASSWORD_BREACH_CHECK === "off" && env.APP_ORIGIN.startsWith("https://")), {
    path: ["PASSWORD_BREACH_CHECK"],
    message: "off is not allowed on an https deployment",
  })
  .refine((env) => !(env.APP_ORIGIN.startsWith("https://") && env.BREVO_API_KEY === undefined), {
    path: ["BREVO_API_KEY"],
    message: "is required on an https deployment, so invites and reset links are really sent",
  })
  // The launch emails never go out as hello@fynix.digital: a prospect letter must not name Fynix anywhere, headers included.
  .refine((env) => env.LAUNCH_EMAILS_ENABLED !== "true" || (env.MAIL_SENDER_ADDRESS !== undefined && !/fynix/i.test(env.MAIL_SENDER_ADDRESS) && !/fynix/i.test(env.MAIL_SENDER_NAME ?? "")), {
    path: ["MAIL_SENDER_ADDRESS"],
    message: "is required, and neither it nor MAIL_SENDER_NAME may name Fynix, while LAUNCH_EMAILS_ENABLED is true",
  })
  .refine((env) => env.MEET_PROVIDER !== "google" || (env.GOOGLE_MEET_CLIENT_ID !== undefined && env.GOOGLE_MEET_CLIENT_SECRET !== undefined && env.GOOGLE_MEET_REFRESH_TOKEN !== undefined), {
    path: ["MEET_PROVIDER"],
    message: "google needs GOOGLE_MEET_CLIENT_ID, GOOGLE_MEET_CLIENT_SECRET and GOOGLE_MEET_REFRESH_TOKEN",
  })
  .refine((env) => env.CALENDAR_SYNC_ENABLED !== "true" || env.CALENDAR_TOKEN_KEY !== undefined, {
    path: ["CALENDAR_TOKEN_KEY"],
    message: "is required while CALENDAR_SYNC_ENABLED is true",
  })
  .refine(
    (env) =>
      env.CALENDAR_SYNC_ENABLED !== "true" ||
      (env.GOOGLE_CALENDAR_CLIENT_ID !== undefined && env.GOOGLE_CALENDAR_CLIENT_SECRET !== undefined) ||
      (env.MICROSOFT_CALENDAR_CLIENT_ID !== undefined && env.MICROSOFT_CALENDAR_CLIENT_SECRET !== undefined),
    { path: ["CALENDAR_SYNC_ENABLED"], message: "needs the client id and secret of Google, Microsoft or both" },
  )
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
  const runtime = [...RUNTIME_ROLES.map((role) => urlVariable(role, "dev")), "BETTER_AUTH_SECRET", "APP_ORIGIN", "PASSWORD_BREACH_CHECK", "BREVO_API_KEY", "REQUIRE_FYNIX_2FA", "LAUNCH_EMAILS_ENABLED", "MAIL_SENDER_ADDRESS", "MAIL_SENDER_NAME", "MEET_PROVIDER", "GOOGLE_MEET_CLIENT_ID", "GOOGLE_MEET_CLIENT_SECRET", "GOOGLE_MEET_REFRESH_TOKEN", "CALENDAR_SYNC_ENABLED", "CALENDAR_TOKEN_KEY", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET"];
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
