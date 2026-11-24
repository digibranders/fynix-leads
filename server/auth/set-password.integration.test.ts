import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth/create-auth";
import { authErrorCode } from "@/server/auth/errors";
import { resolveSessionContext } from "@/server/auth/session-context";
import { captureResetToken, NoSuchAccountError, setAccountPassword, type SetPasswordServices } from "@/server/auth/set-password";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, TEST_ORIGIN, TEST_SECRET, createUserIn, openAuthRig, outboxFor, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { emailOutbox, session, verification } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** `pnpm password:set`'s logic: an operator sets an account's password without an email, on the real test database. */

let rig: AuthRig;
let world: SeedWorld;
let services: SetPasswordServices;
const EMAIL = "client@kestrel.example";

beforeAll(() => {
  rig = openAuthRig();
  // The same Better Auth configuration the script builds, with the token captured in memory instead of queued as an email.
  const capture = captureResetToken();
  const auth = createAuth({ db: rig.dbs.roles.leads_auth.db, secret: TEST_SECRET, baseURL: TEST_ORIGIN, breachChecker: rig.breach, mailer: capture.mailer, nextCookies: false });
  services = { auth, capture };
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
  rig.breach.breached.clear();
  rig.breach.unavailable = false;
});

const signIn = (email: string, password: string, address = "203.0.113.90") => signInWithPassword(rig.services, { email, password, address });

describe("setAccountPassword", () => {
  it("replaces the password: the old one stops working and the new one signs in", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    expect(await setAccountPassword(services, { email: EMAIL, newPassword: NEW_PASSWORD })).toEqual({ email: EMAIL });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("invalid-credentials");
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("finds the account whatever the case or spaces of the address, and works for a Fynix manager as for a client", async () => {
    await createUserIn(rig, world.fynix, { email: "asha@fynix.example", role: "manager" });
    expect(await setAccountPassword(services, { email: "  Asha@Fynix.Example ", newPassword: NEW_PASSWORD })).toEqual({ email: "asha@fynix.example" });
    expect((await signIn("asha@fynix.example", NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("ends every session of that account and leaves other people's sessions alone", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await createUserIn(rig, world.halden, { email: "other@halden.example" });
    const mine = await signIn(EMAIL, GOOD_PASSWORD, "203.0.113.81");
    const others = await signIn("other@halden.example", GOOD_PASSWORD, "203.0.113.83");
    if (mine.status !== "signed-in" || others.status !== "signed-in") throw new Error("setup: sign-in failed");
    const mineHeaders = requestHeadersFrom(mine.headers);
    const otherHeaders = requestHeadersFrom(others.headers);
    expect(await resolveSessionContext(rig.resolution, mineHeaders)).not.toBeNull();

    await setAccountPassword(services, { email: EMAIL, newPassword: NEW_PASSWORD });

    expect(await resolveSessionContext(rig.resolution, mineHeaders)).toBeNull();
    expect(await resolveSessionContext(rig.resolution, otherHeaders)).not.toBeNull();
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, mine.userId))).toEqual([]);
  });

  it("applies the password rules, and a refused password changes nothing", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await expect(setAccountPassword(services, { email: EMAIL, newPassword: "short" })).rejects.toSatisfy((error) => authErrorCode(error) === "WEAK_PASSWORD");
    rig.breach.breached.add(NEW_PASSWORD);
    await expect(setAccountPassword(services, { email: EMAIL, newPassword: NEW_PASSWORD })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_BREACHED");
    rig.breach.unavailable = true;
    await expect(setAccountPassword(services, { email: EMAIL, newPassword: "a-fine-long-passphrase-3" })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_CHECK_UNAVAILABLE");
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");
  });

  it("says so for an address with no account, and changes nothing", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await expect(setAccountPassword(services, { email: "nobody@kestrel.example", newPassword: NEW_PASSWORD })).rejects.toBeInstanceOf(NoSuchAccountError);
    await expect(setAccountPassword(services, { email: "not an address", newPassword: NEW_PASSWORD })).rejects.toThrow();
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");
  });

  it("sends and queues no email, and leaves no usable reset token behind", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await setAccountPassword(services, { email: EMAIL, newPassword: NEW_PASSWORD });
    expect(await outboxFor(rig, EMAIL)).toEqual([]);
    expect(await rig.dbs.owner.db.select().from(emailOutbox)).toEqual([]);
    // The token was used up by the reset itself, so nothing is left to replay.
    const leftovers = await rig.dbs.owner.db.select({ identifier: verification.identifier }).from(verification);
    expect(leftovers.filter((row) => row.identifier.startsWith("reset-password:"))).toEqual([]);
  });

  it("does not hand the token back to a second caller: each run captures its own", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await setAccountPassword(services, { email: EMAIL, newPassword: NEW_PASSWORD });
    await setAccountPassword(services, { email: EMAIL, newPassword: "a-third-long-passphrase-7" });
    expect((await signIn(EMAIL, "a-third-long-passphrase-7")).status).toBe("signed-in");
  });
});
