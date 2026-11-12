import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLengthProblem } from "@/lib/auth/password-policy";
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds } from "@/lib/auth/session-lifetime";
import { hasAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import type { ResetMailer } from "@/server/auth/mail";
import { readMembership } from "@/server/auth/membership";
import type { Database } from "@/server/db/pool";
import { account, session, user, verification } from "@/server/db/schema";

export const MIN_SECRET_LENGTH = 32;
/** The secret Better Auth uses when it is given none. It is in the package source, so it is not a secret. */
const BETTER_AUTH_PUBLIC_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

export interface AuthConfig {
  /** The `leads_auth` database: the only role that may touch the auth tables. */
  readonly db: Database;
  readonly secret: string;
  /** The origin this app is served from, for example `https://leads.fynix.digital`. Also the only trusted origin. */
  readonly baseURL: string;
  readonly breachChecker: BreachChecker;
  readonly mailer: ResetMailer;
  /** Server actions need this to write session cookies. Scripts and tests run outside Next.js and leave it off. */
  readonly nextCookies: boolean;
}

/**
 * Guard 3 of 3 (master plan, section 3). Better Auth warns about a secret under 32 characters and carries on, and with
 * no secret at all it signs sessions with a default that is published in its source, so every session would be forgeable.
 * Refuse instead. Also refuse `BETTER_AUTH_SECRETS`, which Better Auth reads when set and which then replaces the
 * secret passed here.
 */
export function assertUsableSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`The auth secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  if (secret === BETTER_AUTH_PUBLIC_DEFAULT_SECRET) throw new Error("The auth secret is Better Auth's public default. Generate a random one.");
  if (process.env.BETTER_AUTH_SECRETS !== undefined) {
    throw new Error("BETTER_AUTH_SECRETS is set and would replace the configured auth secret. Unset it.");
  }
}

/** The routes that choose a new password, and the body field that carries it. Sign-in is not here: it accepts what the account has. */
const NEW_PASSWORD_FIELDS: Readonly<Record<string, "password" | "newPassword">> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
};

/**
 * Better Auth checks only the length it is given. This runs before every route that chooses a password, so no form,
 * script or route added later can skip the full rule: 12 or more characters and not in a known breach. A breach check
 * that cannot be made refuses the password too (see BreachCheckUnavailableError): the person is asked to try again, and
 * nothing is accepted unchecked.
 */
function passwordPolicy(checker: BreachChecker) {
  return createAuthMiddleware(async (ctx) => {
    const field = NEW_PASSWORD_FIELDS[ctx.path];
    if (field === undefined) return;
    const body: unknown = ctx.body;
    const password = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[field] : undefined;
    // A missing or non-string password is left to the route's own body validation.
    if (typeof password !== "string") return;

    const lengthProblem = passwordLengthProblem(password);
    if (lengthProblem !== null) throw new APIError("BAD_REQUEST", { code: "WEAK_PASSWORD", message: lengthProblem });

    let breached: boolean;
    try {
      breached = await checker.isBreached(password);
    } catch (error) {
      if (error instanceof BreachCheckUnavailableError) {
        throw new APIError("SERVICE_UNAVAILABLE", {
          code: "PASSWORD_CHECK_UNAVAILABLE",
          message: "We could not check that password just now. Try again in a minute.",
        });
      }
      throw error;
    }
    if (breached) {
      throw new APIError("BAD_REQUEST", { code: "PASSWORD_BREACHED", message: "That password has appeared in a data breach. Choose a different one." });
    }
  });
}

export function createAuth(config: AuthConfig) {
  assertUsableSecret(config.secret);

  return betterAuth({
    appName: "Fynix Leads",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(config.db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Guard 2 of 3: with auto sign-in off, a sign-up for an address that already has an account is answered with a
      // success and a user id that was never stored. server/auth/create-account.ts checks the stored row.
      autoSignIn: false,
      // A reset is how someone locked out, or who fears their password is known, gets back in: every session of the
      // account ends with it.
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_LIFETIME_SECONDS,
      sendResetPassword: ({ user: recipient, token }) => config.mailer.sendPasswordReset({ email: recipient.email, token }),
    },
    session: {
      // The longest any session lasts. The hook below shortens it for Fynix.
      expiresIn: SESSION_LIFETIME_SECONDS.client,
      // Fixed lifetimes: using a session never extends it, so a Fynix session ends 12 hours after sign-in.
      disableSessionRefresh: true,
      // No cookie cache: a cached session would keep working after it is revoked, by a password reset for one.
      cookieCache: { enabled: false },
    },
    advanced: {
      // UUIDs, so `app.user_id` in the scope helper is always a UUID and the id columns are uuid.
      database: { generateId: "uuid" },
      cookiePrefix: "fynix-leads",
      // Secure cookies (and the __Secure- prefix) in production whatever the origin says; elsewhere Better Auth follows the
      // origin scheme, so http://localhost works. server/env.ts also refuses an http origin in production.
      useSecureCookies: process.env.NODE_ENV === "production" ? true : undefined,
      // Behind nginx only x-real-ip is trusted: nginx overwrites it with the connecting address, while a client can put
      // anything in x-forwarded-for. server/auth/client-address.ts reads the same header for the rate limits.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      // No cross-subdomain cookie setting: cookies are host-only, never shared with another host under fynix.digital.
    },
    databaseHooks: {
      user: {
        create: {
          before: async (candidate) => {
            // Guard 1 of 3. Refuse by returning false. Never throw a 403 here: Better Auth turns a 403 from this hook
            // into a success response for a user that was never created.
            if (!hasAccountCreationGrant(candidate.email)) return false;
            return;
          },
        },
      },
      session: {
        create: {
          before: async (candidate) => {
            const membership = await readMembership(config.db, candidate.userId);
            // A user who belongs to no organisation, or whose membership is suspended, gets no session at all.
            if (membership === null || membership.status !== "active") return false;
            return { data: { expiresAt: new Date(Date.now() + sessionLifetimeSeconds(membership.orgKind) * 1000) } };
          },
        },
      },
    },
    hooks: { before: passwordPolicy(config.breachChecker) },
    plugins: config.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
