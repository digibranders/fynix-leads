import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionContext, type SessionResolution } from "@/server/auth/session-context";
import { confirmEnrolment, disableSecondFactor, startEnrolment, verifySecondFactor, type VerifyResult } from "@/server/auth/second-factor";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, createUserIn, openAuthRig, requestHeadersFrom, totpCode, type AuthRig } from "@/server/auth/testing";
import { auditLog, session, twoFactor, user } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import { fynixSelfWrite } from "@/server/domain/fynix-write";

/** Gate G1 against real Postgres and a real Better Auth: enrol, the second step at sign-in, backup codes, limits, turning it off. */

let rig: AuthRig;
let world: SeedWorld;
const NOW = new Date("2026-12-01T09:07:30Z");
const ADDRESS = "203.0.113.70";
const EMAIL = "admin@fynix.example";
const HOUR_MS = 3_600_000;
/** The rate limits run on the frozen clock; sessions are made by the real one, so reading them back must use it too. */
const realClock = (): SessionResolution => ({ ...rig.resolution, now: () => new Date() });

beforeAll(() => {
  rig = openAuthRig({ now: () => NOW });
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
});

async function plainSignIn(email: string): Promise<Headers> {
  const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: ADDRESS });
  if (result.status !== "signed-in") throw new Error(`setup: ${email} did not sign in, got ${result.status}`);
  return requestHeadersFrom(result.headers);
}

/** Creates a Fynix admin and turns the second step on, as the profile page would. Returns what a person would keep: the secret and the backup codes. */
async function enrolledAdmin(): Promise<{ readonly userId: string; readonly secret: string; readonly backupCodes: readonly string[]; readonly headers: Headers }> {
  const { userId } = await createUserIn(rig, world.fynix, { email: EMAIL, role: "manager" });
  const headers = await plainSignIn(EMAIL);
  const started = await startEnrolment(rig.services, { userId, kind: "fynix", password: GOOD_PASSWORD, headers });
  if (started.status !== "started") throw new Error("setup: enrolment did not start");
  const confirmed = await confirmEnrolment(rig.services, { userId, code: totpCode(started.secret), headers });
  if (confirmed.status !== "enabled") throw new Error(`setup: enrolment did not confirm, got ${confirmed.status}`);
  return { userId, secret: started.secret, backupCodes: confirmed.backupCodes, headers: requestHeadersFrom(confirmed.headers) };
}

/** The password step for an enrolled account: no session, and the challenge cookie to carry to the code step. */
async function challenge(): Promise<Headers> {
  const result = await signInWithPassword(rig.services, { email: EMAIL, password: GOOD_PASSWORD, address: ADDRESS });
  if (result.status !== "second-factor") throw new Error(`setup: expected the second step, got ${result.status}`);
  return requestHeadersFrom(result.headers);
}

const verify = (kind: "totp" | "backup", code: string, headers: Headers, address = ADDRESS): Promise<VerifyResult> => verifySecondFactor(rig.services, { kind, code, address, headers });

describe("turning the second step on", () => {
  it("is for Fynix people only: a client user is refused before anything is made", async () => {
    const { userId } = await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const headers = await plainSignIn("client@kestrel.example");
    expect(await startEnrolment(rig.services, { userId, kind: "client", password: GOOD_PASSWORD, headers })).toEqual({ status: "not-allowed" });
    expect(await rig.dbs.owner.db.select().from(twoFactor)).toEqual([]);
  });

  it("asks for the password, makes nothing active until the first code is right, then gives ten backup codes once", async () => {
    const { userId } = await createUserIn(rig, world.fynix, { email: EMAIL, role: "manager" });
    const headers = await plainSignIn(EMAIL);
    expect(await startEnrolment(rig.services, { userId, kind: "fynix", password: "wrong-password-entirely", headers })).toEqual({ status: "wrong-password" });

    const started = await startEnrolment(rig.services, { userId, kind: "fynix", password: GOOD_PASSWORD, headers });
    if (started.status !== "started") throw new Error("expected started");
    expect(started.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(started.secret).toMatch(/^[A-Z2-7]+$/);
    // Started but not confirmed: a sign-in still goes straight through.
    expect((await signInWithPassword(rig.services, { email: EMAIL, password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("signed-in");

    expect(await confirmEnrolment(rig.services, { userId, code: "000000", headers })).toEqual({ status: "wrong-code" });
    const confirmed = await confirmEnrolment(rig.services, { userId, code: ` ${totpCode(started.secret).slice(0, 3)} ${totpCode(started.secret).slice(3)} `, headers });
    if (confirmed.status !== "enabled") throw new Error("expected enabled");
    expect(confirmed.backupCodes).toHaveLength(10);
    const [row] = await rig.dbs.owner.db.select({ enabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
    expect(row?.enabled).toBe(true);
    // The secret and the codes are stored encrypted, never as the values shown.
    const [stored] = await rig.dbs.owner.db.select().from(twoFactor).where(eq(twoFactor.userId, userId));
    expect(stored?.secret).not.toContain(started.secret);
    for (const code of confirmed.backupCodes) expect(stored?.backupCodes).not.toContain(code);
    // The new session carries the fact.
    expect(await resolveSessionContext(realClock(), requestHeadersFrom(confirmed.headers))).toMatchObject({ kind: "fynix", twoFactorEnabled: true });
  });
});

describe("the second step at sign-in", () => {
  it("gives no session after the password alone, and a 12 hour one after the right code", async () => {
    const { userId, secret } = await enrolledAdmin();
    const headers = await challenge();
    expect(await resolveSessionContext(realClock(), headers)).toBeNull();
    expect(await verify("totp", "000000", headers)).toEqual({ status: "wrong-code" });

    const done = await verify("totp", totpCode(secret), headers);
    if (done.status !== "signed-in") throw new Error(`expected signed-in, got ${done.status}`);
    expect(done.userId).toBe(userId);
    const context = await resolveSessionContext(realClock(), requestHeadersFrom(done.headers));
    expect(context).toMatchObject({ kind: "fynix", userId, twoFactorEnabled: true });
    const sessions = await rig.dbs.owner.db.select({ createdAt: session.createdAt, expiresAt: session.expiresAt }).from(session).where(eq(session.userId, userId));
    const newest = sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    // The two timestamps come from different clocks a millisecond apart, so allow a second.
    expect(Math.abs((newest?.expiresAt.getTime() ?? 0) - (newest?.createdAt.getTime() ?? 0) - 12 * HOUR_MS)).toBeLessThan(1000);
  });

  it("accepts a backup code once and refuses it the second time", async () => {
    const { backupCodes } = await enrolledAdmin();
    const first = backupCodes[0] ?? "";
    expect((await verify("backup", first, await challenge())).status).toBe("signed-in");
    expect(await verify("backup", first, await challenge())).toEqual({ status: "wrong-code" });
    expect((await verify("backup", backupCodes[1] ?? "", await challenge())).status).toBe("signed-in");
  });

  it("refuses a wrong code, and the challenge dies after five wrong ones: even the right code then needs the password again", async () => {
    const { secret } = await enrolledAdmin();
    const headers = await challenge();
    for (let attempt = 1; attempt <= 5; attempt += 1) expect((await verify("totp", "000000", headers)).status, `attempt ${attempt}`).toBe("wrong-code");
    expect(await verify("totp", totpCode(secret), headers)).toEqual({ status: "start-over" });
  });

  it("is rate limited on the challenge: the eleventh try is refused whatever the code, and a request with no challenge starts over", async () => {
    const { secret } = await enrolledAdmin();
    expect(await verify("totp", "000000", new Headers())).toEqual({ status: "start-over" });
    const headers = await challenge();
    const results: string[] = [];
    for (let attempt = 1; attempt <= 11; attempt += 1) results.push((await verify("totp", attempt === 11 ? totpCode(secret) : "000000", headers)).status);
    expect(results.slice(0, 5)).toEqual(Array(5).fill("wrong-code"));
    expect(results[10]).toBe("rate-limited");
  });

  it("is rate limited on the network: the 21st try from one address is refused, another address is not", async () => {
    await enrolledAdmin();
    let last: VerifyResult = { status: "start-over" };
    for (let attempt = 1; attempt <= 21; attempt += 1) last = await verify("totp", "000000", new Headers({ cookie: `fynix-leads.two_factor=junk${attempt}` }), "198.51.100.9");
    expect(last.status).toBe("rate-limited");
    expect((await verify("totp", "000000", new Headers({ cookie: "fynix-leads.two_factor=junk-elsewhere" }), "198.51.100.10")).status).toBe("start-over");
  });

  it("does not touch a person without the step: a client user signs in as before", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    expect((await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });
});

describe("turning it off", () => {
  it("needs the password, deletes the secret and the codes, and signs in directly afterwards", async () => {
    const { userId, headers } = await enrolledAdmin();
    expect(await disableSecondFactor(rig.services, { userId, password: "wrong-password-entirely", headers })).toEqual({ status: "wrong-password" });
    expect((await disableSecondFactor(rig.services, { userId, password: GOOD_PASSWORD, headers })).status).toBe("disabled");
    expect(await rig.dbs.owner.db.select().from(twoFactor).where(eq(twoFactor.userId, userId))).toEqual([]);
    const [row] = await rig.dbs.owner.db.select({ enabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
    expect(row?.enabled).toBe(false);
    expect((await signInWithPassword(rig.services, { email: EMAIL, password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });
});

describe("the audit row", () => {
  it("is accepted by the database for each of the three actions, in the person's own name", async () => {
    const { userId } = await enrolledAdmin();
    for (const action of ["member.two_factor_enable", "member.two_factor_disable", "member.backup_code_used"] as const) {
      await fynixSelfWrite(rig.dbs.roles.leads_fynix.db, { userId }, (write) => write.audit({ action, subject: { table: "member", id: write.actorMemberId } }));
    }
    const rows = await rig.dbs.owner.db.select({ action: auditLog.action, actor: auditLog.actorUserId }).from(auditLog).where(eq(auditLog.actorUserId, userId));
    expect(rows.map((row) => row.action).sort()).toEqual(["member.backup_code_used", "member.two_factor_disable", "member.two_factor_enable"]);
  });
});
