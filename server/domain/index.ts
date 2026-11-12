import "server-only";
import { randomFillSync } from "node:crypto";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth } from "@/server/auth/create-auth";
import { getDatabase } from "@/server/db/client";
import type { DomainDeps } from "@/server/domain/deps";
import { getEnv } from "@/server/env";
import { brevoTransport } from "@/server/mail/brevo";
import { drainOutbox, type DrainResult } from "@/server/mail/outbox";
import type { MailTransport } from "@/server/mail/transport";

/**
 * The domain services' dependencies for the running app: the three pools they use, the real clock and randomness, the origin
 * links point at, and a Better Auth factory for invite redemption. Built on first use from the environment, like
 * server/auth/index.ts. The services themselves are plain functions that take this (server/domain/*.ts); the admin screens
 * of phase 1D and the accept-invite action call them with `getDomain()`.
 */
let deps: DomainDeps | undefined;

export function getDomain(): DomainDeps {
  if (deps !== undefined) return deps;
  const env = getEnv();
  deps = {
    fynixDb: getDatabase("leads_fynix").db,
    authDb: getDatabase("leads_auth").db,
    publicDb: getDatabase("leads_public").db,
    now: () => new Date(),
    randomBytes: (count) => randomFillSync(new Uint8Array(count)),
    origin: env.APP_ORIGIN,
    // Gate G2: on an https deployment nobody is invited while a party's terms are still placeholder text.
    allowPlaceholderTerms: new URL(env.APP_ORIGIN).protocol !== "https:",
    authFactory: (db) =>
      createAuth({
        db,
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.APP_ORIGIN,
        breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
        // Redemption creates an account and never asks for a reset, so this instance has no use for the mailer.
        mailer: { sendPasswordReset: async () => { throw new Error("A reset email is never sent while an invite is redeemed."); } },
        nextCookies: false,
      }),
  };
  return deps;
}

/** The Brevo transport, or `null` when no key is set (development): then queued messages stay in the outbox. */
export function getMailTransport(): MailTransport | null {
  const { BREVO_API_KEY } = getEnv();
  return BREVO_API_KEY === undefined ? null : brevoTransport({ apiKey: BREVO_API_KEY });
}

/**
 * Sends what is waiting in the outbox once. The admin actions that queue an invite call it after their transaction commits,
 * without awaiting it in the request (Next.js `after()`), and a timer or `pnpm outbox:run` calls it too. It never throws for
 * a delivery problem: those are recorded on the message and retried.
 */
export function sendQueuedMail(): Promise<DrainResult> {
  return drainOutbox(getDomain().authDb, getMailTransport());
}
