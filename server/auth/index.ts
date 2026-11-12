import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { PASSWORD_RESET_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { passwordResetMailer } from "@/server/auth/mail";
import { resolveSessionContext, type SessionContext } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { getDatabase } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { outboxOn } from "@/server/mail/outbox";

/**
 * Module scope, not globalThis like the pools: a hot reload re-evaluates this module and picks up a changed
 * configuration, and the instance holds only a reference to a pool that globalThis keeps.
 */
let auth: Auth | undefined;

/** The Better Auth instance for the running app, on the `leads_auth` pool. Better Auth's own HTTP routes are not served: the app calls `auth.api` from server code. */
export function getAuth(): Auth {
  if (auth !== undefined) return auth;
  const env = getEnv();
  auth = createAuth({
    db: getDatabase("leads_auth").db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
    mailer: passwordResetMailer(outboxOn(getDatabase("leads_public").db), env.APP_ORIGIN, PASSWORD_RESET_LIFETIME_SECONDS / 60),
    nextCookies: true,
  });
  return auth;
}

/** What the sign-in and reset services need. */
export function getAuthServices(): AuthServices {
  return { auth: getAuth(), publicDb: getDatabase("leads_public").db };
}

/**
 * Who this request is, or `null` when nobody is signed in. Resolved once per request (`cache`), from the session cookie,
 * through `member` to the organisation kind. Call it from server components, server actions and route handlers; never
 * pass its result to a client component, which needs only what it renders.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> =>
  resolveSessionContext({ reader: getAuth(), authDb: getDatabase("leads_auth").db }, await headers()),
);
