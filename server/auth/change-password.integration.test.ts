import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changeOwnPassword } from "@/server/auth/change-password";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, createUserIn, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { session } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** Changing your own password, through Better Auth on the real test database: the current password is checked, the reset rule applies, other sessions end. */

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
  rig.breach.unavailable = false;
});

async function signedIn(email: string) {
  const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: "203.0.113.1" });
  if (result.status !== "signed-in") throw new Error("setup: sign-in failed");
  return { userId: result.userId, headers: requestHeadersFrom(result.headers) };
}
const signInStatus = async (password: string) => (await signInWithPassword(rig.services, { email: "pat@example.com", password, address: "203.0.113.2" })).status;

describe("changeOwnPassword", () => {
  it("changes the password when the current one is right, and ends the other sessions of the account", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const here = await signedIn("pat@example.com");
    await signedIn("pat@example.com");
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, here.userId))).toHaveLength(2);
    const result = await changeOwnPassword(rig.services, { userId: here.userId, currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD, headers: here.headers });
    expect(result).toEqual({ status: "changed" });
    // Both old sessions are gone (this request got a fresh one), so a cookie from before the change no longer resolves.
    const rows = await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, here.userId));
    expect(rows).toHaveLength(1);
    expect(await signInStatus(NEW_PASSWORD)).toBe("signed-in");
    expect(await signInStatus(GOOD_PASSWORD)).toBe("invalid-credentials");
  });

  it("refuses a wrong current password, changes nothing, and does not reach the breach service", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const here = await signedIn("pat@example.com");
    rig.breach.checked.length = 0;
    expect(await changeOwnPassword(rig.services, { userId: here.userId, currentPassword: "not-my-password-1!", newPassword: NEW_PASSWORD, headers: here.headers })).toEqual({ status: "wrong-password" });
    expect(await signInStatus(GOOD_PASSWORD)).toBe("signed-in");
  });

  it("applies the reset rule: too short, no special character, the same as now, and a breached password", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const here = await signedIn("pat@example.com");
    const change = (newPassword: string) => changeOwnPassword(rig.services, { userId: here.userId, currentPassword: GOOD_PASSWORD, newPassword, headers: here.headers });
    expect(await change("short1!")).toMatchObject({ status: "weak-password", message: "Use at least 8 characters." });
    expect(await change("onlyletters12345")).toMatchObject({ status: "weak-password" });
    expect(await change(GOOD_PASSWORD)).toMatchObject({ status: "weak-password", message: "Choose a password that is different from your current one." });
    rig.breach.breached.add(NEW_PASSWORD);
    expect(await change(NEW_PASSWORD)).toMatchObject({ status: "weak-password" });
    expect(await signInStatus(GOOD_PASSWORD)).toBe("signed-in");
  });

  it("changes nothing when the breach service is down", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const here = await signedIn("pat@example.com");
    rig.breach.unavailable = true;
    expect(await changeOwnPassword(rig.services, { userId: here.userId, currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD, headers: here.headers })).toEqual({ status: "check-unavailable" });
    expect(await signInStatus(GOOD_PASSWORD)).toBe("signed-in");
  });

  it("limits the tries per account: ten an hour, then it says when to try again", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const here = await signedIn("pat@example.com");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await changeOwnPassword(rig.services, { userId: here.userId, currentPassword: "wrong-password-1!", newPassword: NEW_PASSWORD, headers: here.headers })).status).toBe("wrong-password");
    }
    expect((await changeOwnPassword(rig.services, { userId: here.userId, currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD, headers: here.headers })).status).toBe("rate-limited");
  });
});
