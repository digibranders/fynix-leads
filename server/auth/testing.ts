import { count, desc, eq } from "drizzle-orm";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import { createAccountWithGrant } from "@/server/auth/create-account";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { passwordResetMailer } from "@/server/auth/mail";
import type { SessionResolution } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { emailOutbox, member, user } from "@/server/db/schema";
import { openTestDatabases, type TestDatabases } from "@/server/db/testing";
import { outboxOn } from "@/server/mail/outbox";
import type { SeededOrganisation } from "@/server/db/testing/seed";

/** Test harness for the auth integration tests: real Better Auth on the real test database, with a fake breach service. */

export const TEST_SECRET = "integration-test-secret-0123456789-abcdefghijklmnop";
export const TEST_ORIGIN = "http://localhost:3020";
export const GOOD_PASSWORD = "correct-horse-battery-staple-7";
export const NEW_PASSWORD = "another-long-passphrase-9";

/** A breach service that answers from a list, and can be switched to "unavailable". It never touches the network. */
export class FakeBreachChecker implements BreachChecker {
  readonly breached = new Set<string>();
  readonly checked: string[] = [];
  unavailable = false;

  async isBreached(password: string): Promise<boolean> {
    this.checked.push(password);
    if (this.unavailable) throw new BreachCheckUnavailableError("fake outage");
    return this.breached.has(password);
  }
}

export interface AuthRig {
  readonly dbs: TestDatabases;
  readonly auth: Auth;
  readonly breach: FakeBreachChecker;
  /** What the sign-in and reset services need. `now` can be set by a test to freeze or move the rate-limit clock. */
  readonly services: AuthServices;
  readonly resolution: SessionResolution;
  readonly close: () => Promise<void>;
}

export function openAuthRig(options: { readonly baseURL?: string; readonly now?: () => Date } = {}): AuthRig {
  const dbs = openTestDatabases();
  const breach = new FakeBreachChecker();
  const baseURL = options.baseURL ?? TEST_ORIGIN;
  const auth = createAuth({
    db: dbs.roles.leads_auth.db,
    secret: TEST_SECRET,
    baseURL,
    breachChecker: breach,
    mailer: passwordResetMailer(outboxOn(dbs.roles.leads_public.db), baseURL, 60),
    nextCookies: false,
  });
  return {
    dbs,
    auth,
    breach,
    services: { auth, publicDb: dbs.roles.leads_public.db, now: options.now },
    resolution: { reader: auth, authDb: dbs.roles.leads_auth.db, now: options.now },
    close: () => dbs.closeAll(),
  };
}

export interface NewUser {
  readonly email: string;
  readonly password?: string;
  readonly role?: "member" | "manager";
  readonly status?: "active" | "suspended";
  /** Skip the membership, to test a user who belongs to nobody. */
  readonly withoutMembership?: boolean;
}

/** A real account through the grant, and a membership written by the owner, as `pnpm admin:create` and phase 1C's invites do. */
export async function createUserIn(rig: AuthRig, organisation: SeededOrganisation, input: NewUser): Promise<{ readonly userId: string; readonly email: string }> {
  const created = await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: input.email, name: `Name of ${input.email}`, password: input.password ?? GOOD_PASSWORD });
  if (input.withoutMembership !== true) {
    await rig.dbs.owner.db.insert(member).values({
      userId: created.userId,
      orgId: organisation.id,
      orgKind: organisation.kind,
      role: input.role ?? "member",
      status: input.status ?? "active",
      displayName: `Name of ${input.email}`,
    });
  }
  return created;
}

/** The request headers a browser would send after a sign-in: the cookie names and values from the `Set-Cookie` headers. */
export function requestHeadersFrom(setCookieSource: Headers): Headers {
  const cookies = setCookieSource.getSetCookie().map((line) => line.split(";")[0] ?? "");
  return new Headers({ cookie: cookies.join("; ") });
}

export async function countUsers(rig: AuthRig): Promise<number> {
  const rows = await rig.dbs.owner.db.select({ value: count() }).from(user);
  return rows[0]?.value ?? 0;
}

export async function outboxFor(
  rig: AuthRig,
  email: string,
): Promise<{ readonly recipient: string; readonly subject: string; readonly body: string; readonly link: string | null }[]> {
  return rig.dbs.owner.db
    .select({ recipient: emailOutbox.recipient, subject: emailOutbox.subject, body: emailOutbox.body, link: emailOutbox.link })
    .from(emailOutbox)
    .where(eq(emailOutbox.recipient, email))
    .orderBy(desc(emailOutbox.createdAt));
}

/** The reset token in the link of the newest queued message for `email`. The stored copy of the text has no link; the `link` column does. */
export async function latestResetToken(rig: AuthRig, email: string): Promise<string> {
  const newest = (await outboxFor(rig, email))[0];
  const token = newest?.link == null ? null : new URL(newest.link).searchParams.get("token");
  if (token === null) throw new Error(`No reset link was queued for ${email}`);
  return token;
}
