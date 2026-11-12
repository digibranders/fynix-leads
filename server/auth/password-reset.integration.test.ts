import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, createUserIn, latestResetToken, openAuthRig, outboxFor, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { emailOutbox, session, verification } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The password reset flow end to end: request, the queued message, the token, the new password, the ended sessions. */

let rig: AuthRig;
let world: SeedWorld;
const ADDRESS = "203.0.113.70";
const EMAIL = "client@kestrel.example";

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

const signIn = (email: string, password: string, address = ADDRESS) => signInWithPassword(rig.services, { email, password, address });
const request = (email: string, address = ADDRESS) => requestPasswordReset(rig.services, { email, address });
const complete = (token: string, newPassword: string, address = ADDRESS) => completePasswordReset(rig.services, { token, newPassword, address });
const verificationRows = () => rig.dbs.owner.db.select().from(verification).where(like(verification.identifier, "reset-password:%"));

describe("asking for a reset link", () => {
  it("queues one message for the address, written as leads_public, with a link to this app's reset page", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    expect(await request("Client@Kestrel.example")).toEqual({ status: "sent" });
    const messages = await outboxFor(rig, EMAIL);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe("Reset your Fynix Leads password");
    expect(messages[0]?.link).toContain("http://localhost:3020/reset-password?token=");
    // The stored copy keeps what the message said and not the link.
    expect(messages[0]?.body).toContain("within 60 minutes");
    expect(messages[0]?.body).not.toContain("http");
    const stored = await rig.dbs.owner.db.select({ status: emailOutbox.status, template: emailOutbox.template }).from(emailOutbox);
    expect(stored).toEqual([{ status: "pending", template: "password_reset" }]);
  });

  it("gives the same answer and queues nothing for an unknown or a malformed address", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    expect(await request("nobody@kestrel.example")).toEqual({ status: "sent" });
    expect(await request("not an email")).toEqual({ status: "sent" });
    expect(await request("a".repeat(300) + "@example.com")).toEqual({ status: "sent" });
    expect(await rig.dbs.owner.db.select().from(emailOutbox)).toEqual([]);
    expect(await verificationRows()).toEqual([]);
  });

  it("limits one account to three reset requests an hour, whoever asks, and says nothing about whether the account exists", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    for (const [index, address] of ["203.0.113.71", "203.0.113.72", "203.0.113.73"].entries()) {
      expect(await request(EMAIL, address), `request ${index + 1}`).toEqual({ status: "sent" });
    }
    expect((await request(EMAIL, "203.0.113.74")).status).toBe("rate-limited");
    expect((await request("nobody@example.com", "203.0.113.75")).status).toBe("sent");
    for (const address of ["203.0.113.76", "203.0.113.77", "203.0.113.78"]) await request("nobody@kestrel.example", address);
    expect((await request("nobody@kestrel.example", "203.0.113.79")).status).toBe("rate-limited");
    expect(await outboxFor(rig, EMAIL)).toHaveLength(3);
  });

  it("limits one network to ten requests an hour", async () => {
    for (let index = 1; index <= 10; index += 1) expect((await request(`person${index}@example.com`)).status).toBe("sent");
    expect((await request("person11@example.com")).status).toBe("rate-limited");
  });

  it("stores the token in the verification table with a one hour expiry", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const rows = await verificationRows();
    expect(rows).toHaveLength(1);
    const lifetime = Math.round(((rows[0]?.expiresAt.getTime() ?? 0) - (rows[0]?.createdAt.getTime() ?? 0)) / 1000);
    expect(Math.abs(lifetime - 3600)).toBeLessThanOrEqual(5);
  });
});

describe("choosing a new password", () => {
  it("replaces the password, so the old one stops working and the new one signs in", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "reset" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("invalid-credentials");
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("works once: the second use of the same link is an invalid token", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    expect((await complete(token, NEW_PASSWORD)).status).toBe("reset");
    expect(await complete(token, "a-third-long-passphrase-7")).toEqual({ status: "invalid-token" });
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("refuses a token that was never issued", async () => {
    expect(await complete("never-issued-token-000000", NEW_PASSWORD)).toEqual({ status: "invalid-token" });
  });

  it("refuses a token after an hour", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    await rig.dbs.owner.db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(like(verification.identifier, "reset-password:%"));
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "invalid-token" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");
  });

  it("applies the password policy, and a refused password does not use up the link", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);

    expect(await complete(token, "short")).toEqual({ status: "weak-password", message: "Use at least 8 characters." });
    rig.breach.breached.add(NEW_PASSWORD);
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "weak-password", message: "That password has appeared in a data breach. Choose a different one." });
    rig.breach.unavailable = true;
    expect(await complete(token, "a-fine-long-passphrase-3")).toEqual({ status: "check-unavailable" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");

    rig.breach.unavailable = false;
    expect(await complete(token, "a-fine-long-passphrase-3")).toEqual({ status: "reset" });
  });

  it("ends every session of the account and leaves other people's sessions alone", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await createUserIn(rig, world.halden, { email: "other@halden.example" });
    const first = await signIn(EMAIL, GOOD_PASSWORD, "203.0.113.81");
    const second = await signIn(EMAIL, GOOD_PASSWORD, "203.0.113.82");
    const other = await signIn("other@halden.example", GOOD_PASSWORD, "203.0.113.83");
    if (first.status !== "signed-in" || second.status !== "signed-in" || other.status !== "signed-in") throw new Error("setup: sign-in failed");
    const headers = [first, second, other].map((result) => requestHeadersFrom(result.headers));
    for (const each of headers) expect(await resolveSessionContext(rig.resolution, each)).not.toBeNull();

    await request(EMAIL);
    expect((await complete(await latestResetToken(rig, EMAIL), NEW_PASSWORD)).status).toBe("reset");

    expect(await resolveSessionContext(rig.resolution, headers[0] ?? new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, headers[1] ?? new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, headers[2] ?? new Headers())).not.toBeNull();
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, first.userId))).toEqual([]);
  });

  it("does not sign anyone in: the person signs in with the new password", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    await complete(await latestResetToken(rig, EMAIL), NEW_PASSWORD);
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session)).toEqual([]);
  });

  it("limits token attempts to 20 an hour per network", async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) expect((await complete(`guess-${attempt}-000000000000`, NEW_PASSWORD)).status).toBe("invalid-token");
    expect((await complete("guess-21-000000000000", NEW_PASSWORD)).status).toBe("rate-limited");
    expect((await complete("guess-22-000000000000", NEW_PASSWORD, "198.51.100.5")).status).toBe("invalid-token");
  });
});
