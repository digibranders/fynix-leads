import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-cookie";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { AccountAlreadyExistsError, createAccountWithGrant } from "@/server/auth/create-account";
import { authErrorCode } from "@/server/auth/errors";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, TEST_ORIGIN, TEST_SECRET, countUsers, createUserIn, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { account, session, user, verification } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * Better Auth on the real test database: the three known quirks and their guards, the password policy, sign-in and the
 * session and cookie rules. The reset flow, the rate limits and session resolution have their own files.
 */

let rig: AuthRig;
let world: SeedWorld;

beforeAll(() => {
  rig = openAuthRig();
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
  rig.breach.breached.clear();
  rig.breach.checked.length = 0;
  rig.breach.unavailable = false;
});

/** The error an operation must reject with. Fails the test if it succeeds. */
async function failure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected the operation to fail, but it succeeded.");
    },
    (error: unknown) => error,
  );
}

const hasRow = async (email: string): Promise<boolean> => (await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, email))).length > 0;

describe("guard 1: an account is created only inside a grant for its address", () => {
  const body = { name: "Pat Example", email: "pat@example.com", password: GOOD_PASSWORD };

  it("refuses a sign-up with no grant, and no row is written", async () => {
    expect(authErrorCode(await failure(rig.auth.api.signUpEmail({ body })))).toBe("FAILED_TO_CREATE_USER");
    expect(await countUsers(rig)).toBe(0);
    expect(await hasRow(body.email)).toBe(false);
  });

  it("refuses a sign-up when the grant names another address", async () => {
    const error = await failure(withAccountCreationGrant("someone-else@example.com", () => rig.auth.api.signUpEmail({ body })));
    expect(authErrorCode(error)).toBe("FAILED_TO_CREATE_USER");
    expect(await hasRow(body.email)).toBe(false);
  });

  it("creates the account inside a matching grant, with the address in lower case and a UUID id", async () => {
    const created = await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { ...body, email: " Pat@Example.COM " });
    expect(created.email).toBe("pat@example.com");
    expect(created.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await hasRow("pat@example.com")).toBe(true);
  });

  it("canary: a 403 thrown from the create-user hook is answered as a success for a user that was never created (the reason the hook returns false)", async () => {
    const throwing = betterAuth({
      secret: TEST_SECRET,
      baseURL: TEST_ORIGIN,
      database: drizzleAdapter(rig.dbs.roles.leads_auth.db, { provider: "pg", schema: { user, session, account, verification } }),
      emailAndPassword: { enabled: true, autoSignIn: false },
      advanced: { database: { generateId: "uuid" } },
      databaseHooks: {
        user: {
          create: {
            before: async () => {
              throw new APIError("FORBIDDEN", { message: "no" });
            },
          },
        },
      },
    });
    const result = await throwing.api.signUpEmail({ body });
    expect(result.user.email).toBe(body.email);
    expect(await hasRow(body.email)).toBe(false);
  });
});

describe("guard 2: a sign-up for an address that exists reports it, instead of trusting the id Better Auth returns", () => {
  it("throws AccountAlreadyExistsError and leaves one row and the first password", async () => {
    await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "dup@example.com", name: "First", password: GOOD_PASSWORD });
    const error = await failure(createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "DUP@example.com", name: "Second", password: NEW_PASSWORD }));
    expect(error).toBeInstanceOf(AccountAlreadyExistsError);
    expect(await countUsers(rig)).toBe(1);
    const rows = await rig.dbs.owner.db.select({ name: user.name }).from(user).where(eq(user.email, "dup@example.com"));
    expect(rows).toEqual([{ name: "First" }]);
  });

  it("canary: the raw call answers a duplicate with a success and an id that is not in the table", async () => {
    await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "dup@example.com", name: "First", password: GOOD_PASSWORD });
    const raw = await withAccountCreationGrant("dup@example.com", () => rig.auth.api.signUpEmail({ body: { name: "Second", email: "dup@example.com", password: NEW_PASSWORD } }));
    expect(raw.user.id).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.id, raw.user.id));
    expect(rows).toEqual([]);
  });
});

describe("guard 3: the secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("canary: with no secret Better Auth signs with a default that is published in its source", async () => {
    // Better Auth falls back to these variables before it falls back to the default; blank them for this test.
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    const unsafe = betterAuth({
      secret: "",
      baseURL: TEST_ORIGIN,
      database: drizzleAdapter(rig.dbs.roles.leads_auth.db, { provider: "pg", schema: { user, session, account, verification } }),
    });
    expect((await unsafe.$context).secret).toBe("better-auth-secret-12345678901234567890");
  });
});

describe("password policy", () => {
  const attempt = (email: string, password: string) => createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email, name: "Pat", password });

  it("refuses 11 characters, accepts 12, and asks the breach service about neither the short one nor a missing one", async () => {
    const error = await failure(attempt("short@example.com", "a".repeat(11)));
    expect(authErrorCode(error)).toBe("WEAK_PASSWORD");
    expect(rig.breach.checked).toEqual([]);
    expect(await hasRow("short@example.com")).toBe(false);

    await attempt("ok@example.com", "a1b2c3d4e5f6");
    expect(await hasRow("ok@example.com")).toBe(true);
    expect(rig.breach.checked).toEqual(["a1b2c3d4e5f6"]);
  });

  it("refuses more than 128 characters", async () => {
    expect(authErrorCode(await failure(attempt("long@example.com", "a".repeat(129))))).toBe("WEAK_PASSWORD");
  });

  it("refuses a password that is in a breach, creates nothing, and says so in words for the person", async () => {
    rig.breach.breached.add("password1234");
    const error = await failure(attempt("breach@example.com", "password1234"));
    expect(authErrorCode(error)).toBe("PASSWORD_BREACHED");
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).body?.message).toBe("That password has appeared in a data breach. Choose a different one.");
    expect(await hasRow("breach@example.com")).toBe(false);
  });

  it("refuses when the breach service is down, creates nothing, and says to try again", async () => {
    rig.breach.unavailable = true;
    const error = await failure(attempt("outage@example.com", GOOD_PASSWORD));
    expect(authErrorCode(error)).toBe("PASSWORD_CHECK_UNAVAILABLE");
    expect((error as APIError).body?.message).toBe("We could not check that password just now. Try again in a minute.");
    expect(await hasRow("outage@example.com")).toBe(false);
  });

  it("applies to a password change too, and keeps the old password when it refuses", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const signedIn = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    if (signedIn.status !== "signed-in") throw new Error("setup: sign-in failed");
    const headers = requestHeadersFrom(signedIn.headers);

    expect(authErrorCode(await failure(rig.auth.api.changePassword({ body: { currentPassword: GOOD_PASSWORD, newPassword: "tooshort" }, headers })))).toBe("WEAK_PASSWORD");
    rig.breach.breached.add(NEW_PASSWORD);
    expect(authErrorCode(await failure(rig.auth.api.changePassword({ body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD }, headers })))).toBe("PASSWORD_BREACHED");

    const again = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    expect(again.status).toBe("signed-in");
  });

  it("does not apply at sign-in: a password that has since been found in a breach still signs in, so it can be changed", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    rig.breach.breached.add(GOOD_PASSWORD);
    rig.breach.checked.length = 0;
    const result = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    expect(result.status).toBe("signed-in");
    expect(rig.breach.checked).toEqual([]);
  });
});

describe("sign in", () => {
  const address = "203.0.113.20";

  it("signs in each kind of user, with the address in any case", async () => {
    await createUserIn(rig, world.fynix, { email: "admin@fynix.example" });
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await createUserIn(rig, world.brightpath, { email: "agent@brightpath.example" });
    for (const email of ["Admin@Fynix.example", "client@KESTREL.example", " agent@brightpath.example "]) {
      const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address });
      expect(result.status, email).toBe("signed-in");
    }
  });

  it("gives one answer for a wrong password, an unknown address and a malformed one", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    for (const [email, password] of [
      ["client@kestrel.example", "wrong-password-entirely"],
      ["nobody@kestrel.example", GOOD_PASSWORD],
      ["not-an-email", GOOD_PASSWORD],
      ["client@kestrel.example", ""],
    ] as const) {
      expect(await signInWithPassword(rig.services, { email, password, address }), `${email} / ${password}`).toEqual({ status: "invalid-credentials" });
    }
  });

  it("makes no session for a user with no membership or a suspended one, and answers exactly as for a wrong password", async () => {
    await createUserIn(rig, world.kestrel, { email: "nobody@kestrel.example", withoutMembership: true });
    await createUserIn(rig, world.kestrel, { email: "suspended@kestrel.example", status: "suspended" });
    const wrongPassword = await signInWithPassword(rig.services, { email: "suspended@kestrel.example", password: "wrong-password-entirely", address });
    expect(wrongPassword).toEqual({ status: "invalid-credentials" });
    // Changed on purpose (review finding 3): these used to return a distinct "not-active" result, which told a caller the password was right.
    expect(await signInWithPassword(rig.services, { email: "nobody@kestrel.example", password: GOOD_PASSWORD, address })).toEqual(wrongPassword);
    expect(await signInWithPassword(rig.services, { email: "suspended@kestrel.example", password: GOOD_PASSWORD, address })).toEqual(wrongPassword);
    const sessions = await rig.dbs.owner.db.select({ id: session.id }).from(session).innerJoin(user, eq(user.id, session.userId)).where(eq(user.email, "suspended@kestrel.example"));
    expect(sessions).toEqual([]);
  });
});

describe("sessions", () => {
  const lifetimeOf = async (email: string): Promise<number> => {
    const rows = await rig.dbs.owner.db
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(eq(user.email, email));
    const row = rows[0];
    if (row === undefined) throw new Error(`No session for ${email}`);
    return Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 1000);
  };

  it("last 14 days for a client and an agency user and 12 hours for a Fynix admin", async () => {
    await createUserIn(rig, world.fynix, { email: "admin@fynix.example" });
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await createUserIn(rig, world.brightpath, { email: "agent@brightpath.example" });
    for (const email of ["admin@fynix.example", "client@kestrel.example", "agent@brightpath.example"]) {
      expect((await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: "203.0.113.30" })).status).toBe("signed-in");
    }
    expect(Math.abs((await lifetimeOf("admin@fynix.example")) - 43_200)).toBeLessThanOrEqual(5);
    expect(Math.abs((await lifetimeOf("client@kestrel.example")) - 1_209_600)).toBeLessThanOrEqual(5);
    expect(Math.abs((await lifetimeOf("agent@brightpath.example")) - 1_209_600)).toBeLessThanOrEqual(5);
  });

  it("are stored under a random id, with a token Better Auth signed, one row per sign-in", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "203.0.113.31" });
    await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "203.0.113.31" });
    const rows = await rig.dbs.owner.db.select({ id: session.id, token: session.token }).from(session).innerJoin(user, eq(user.id, session.userId)).where(eq(user.email, "client@kestrel.example"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.token)).size).toBe(2);
  });
});

describe("the session cookie", () => {
  const cookieLines = async (rigUnderTest: AuthRig, email: string): Promise<string[]> => {
    const result = await signInWithPassword(rigUnderTest.services, { email, password: GOOD_PASSWORD, address: "203.0.113.40" });
    if (result.status !== "signed-in") throw new Error("setup: sign-in failed");
    return result.headers.getSetCookie();
  };

  it("is host-only, HttpOnly, SameSite=Lax and not Secure on http", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const lines = await cookieLines(rig, "client@kestrel.example");
    expect(lines).toHaveLength(1);
    const cookie = lines[0] ?? "";
    expect(cookie).toMatch(/^fynix-leads\.session_token=/);
    expect(SESSION_COOKIE_NAMES).toContain(cookie.split("=")[0]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("is Secure, prefixed with __Secure- and still host-only on https", async () => {
    const secureRig = openAuthRig({ baseURL: "https://leads.example.test" });
    try {
      await createUserIn(secureRig, world.kestrel, { email: "client@kestrel.example" });
      const cookie = (await cookieLines(secureRig, "client@kestrel.example"))[0] ?? "";
      expect(cookie).toMatch(/^__Secure-fynix-leads\.session_token=/);
      expect(SESSION_COOKIE_NAMES).toContain(cookie.split("=")[0]);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toMatch(/Domain=/i);
    } finally {
      await secureRig.close();
    }
  });
});
