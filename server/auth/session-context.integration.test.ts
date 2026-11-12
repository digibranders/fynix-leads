import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, createUserIn, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { campaign, member, session } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** Session cookie to member to organisation kind to role pool, on the real test database. */

let rig: AuthRig;
let world: SeedWorld;
const ADDRESS = "203.0.113.60";
const HOUR_MS = 3_600_000;

beforeAll(() => {
  rig = openAuthRig();
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
});

/** Creates a user in `organisation`, signs in and returns the request headers a browser would then send. */
async function signedInHeaders(organisation: SeedWorld["fynix"], email: string, options: { readonly role?: "member" | "manager" } = {}): Promise<{ readonly headers: Headers; readonly userId: string }> {
  const { userId } = await createUserIn(rig, organisation, { email, role: options.role });
  const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: ADDRESS });
  if (result.status !== "signed-in") throw new Error(`setup: ${email} could not sign in`);
  return { headers: requestHeadersFrom(result.headers), userId };
}

describe("resolveSessionContext", () => {
  it("resolves a Fynix admin to the Fynix pool, with no organisation scope to apply", async () => {
    const { headers, userId } = await signedInHeaders(world.fynix, "admin@fynix.example", { role: "manager" });
    const context = await resolveSessionContext(rig.resolution, headers);
    expect(context).toMatchObject({ kind: "fynix", role: "leads_fynix", userId, orgId: world.fynix.id, memberRole: "manager" });
  });

  it("resolves a client user to the client pool and its own organisation", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    expect(await resolveSessionContext(rig.resolution, headers)).toMatchObject({ kind: "client", role: "leads_client", userId, orgId: world.kestrel.id, memberRole: "member" });
  });

  it("resolves an agency user to the agency pool and its own organisation, with the name on the account", async () => {
    const { headers, userId } = await signedInHeaders(world.northgate, "agent@northgate.example");
    expect(await resolveSessionContext(rig.resolution, headers)).toMatchObject({ kind: "agency", role: "leads_agency", userId, orgId: world.northgate.id, name: "Name of agent@northgate.example" });
  });

  it("returns null for no cookie, a garbage cookie and a cookie whose signature was changed", async () => {
    const { headers } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const cookie = headers.get("cookie") ?? "";
    expect(await resolveSessionContext(rig.resolution, new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, new Headers({ cookie: "fynix-leads.session_token=garbage" }))).toBeNull();
    const tampered = cookie.replace(/.$/, cookie.endsWith("A") ? "B" : "A");
    expect(tampered).not.toBe(cookie);
    expect(await resolveSessionContext(rig.resolution, new Headers({ cookie: tampered }))).toBeNull();
  });

  it("returns null once the session is signed out", async () => {
    const { headers } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    expect(await resolveSessionContext(rig.resolution, headers)).not.toBeNull();
    await rig.auth.api.signOut({ headers });
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("returns null once the session row has expired", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    await rig.dbs.owner.db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("returns null as soon as the membership is suspended or removed, although the session is still live", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
    await rig.dbs.owner.db.update(member).set({ status: "active" }).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).not.toBeNull();
    await rig.dbs.owner.db.delete(member).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("does not extend a session by reading it, even when the read asks for a refresh", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    // Two days used: past Better Auth's one-day update age, the point at which it would normally push the expiry out.
    const twelveDaysFromNow = new Date(Date.now() + 12 * 24 * HOUR_MS);
    await rig.dbs.owner.db.update(session).set({ expiresAt: twelveDaysFromNow }).where(eq(session.userId, userId));
    await rig.auth.api.getSession({ headers, query: { disableRefresh: false } });
    await resolveSessionContext(rig.resolution, headers);
    const rows = await rig.dbs.owner.db.select({ expiresAt: session.expiresAt }).from(session).where(eq(session.userId, userId));
    expect(rows[0]?.expiresAt.getTime()).toBe(twelveDaysFromNow.getTime());
  });
});

describe("the lifetime is checked twice", () => {
  it("a Fynix session is over after 12 hours and a client session is not", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    const client = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const at = (hours: number) => ({ ...rig.resolution, now: () => new Date(Date.now() + hours * HOUR_MS) });
    expect(await resolveSessionContext(at(11), admin.headers)).not.toBeNull();
    expect(await resolveSessionContext(at(13), admin.headers)).toBeNull();
    expect(await resolveSessionContext(at(13), client.headers)).not.toBeNull();
    expect(await resolveSessionContext(at(14 * 24 + 1), client.headers)).toBeNull();
  });

  it("holds even if the stored expiry were extended: a Fynix session older than 12 hours does not resolve", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    await rig.dbs.owner.db.update(session).set({ expiresAt: new Date(Date.now() + 30 * 24 * HOUR_MS) }).where(eq(session.userId, admin.userId));
    expect(await resolveSessionContext({ ...rig.resolution, now: () => new Date(Date.now() + 13 * HOUR_MS) }, admin.headers)).toBeNull();
  });
});

describe("the second factor extension point", () => {
  it("accepts every session today: Fynix is password only until gate G1", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    expect(await resolveSessionContext(rig.resolution, admin.headers)).not.toBeNull();
  });

  it("is consulted for every session, and a refusal means not signed in", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    const seen: string[] = [];
    const refusing = { ...rig.resolution, secondFactor: async (subject: { readonly kind: string }) => (seen.push(subject.kind), false) };
    expect(await resolveSessionContext(refusing, admin.headers)).toBeNull();
    expect(seen).toEqual(["fynix"]);
  });
});

describe("a resolved session picks the role pool that sees only its own rows", () => {
  it("client and agency see their own two campaigns, and Fynix sees all four", async () => {
    const client = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const agency = await signedInHeaders(world.brightpath, "agent@brightpath.example");
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");

    const asTenant = async (headers: Headers) => {
      const context = await resolveSessionContext(rig.resolution, headers);
      if (context === null || context.kind === "fynix") throw new Error("expected a tenant session");
      const rows = await withScope(rig.dbs.roles[context.role].db, { orgId: context.orgId, userId: context.userId }, (tx) => selectCampaigns(tx, context.role));
      return rows.map((row) => row.publicRef).sort();
    };
    expect(await asTenant(client.headers)).toEqual(world.campaigns.filter((row) => row.client.id === world.kestrel.id).map((row) => row.publicRef).sort());
    expect(await asTenant(agency.headers)).toEqual(world.campaigns.filter((row) => row.agency.id === world.brightpath.id).map((row) => row.publicRef).sort());

    const fynixContext = await resolveSessionContext(rig.resolution, admin.headers);
    if (fynixContext === null) throw new Error("expected a Fynix session");
    const all = await withScope(rig.dbs.roles[fynixContext.role].db, { orgId: null, userId: fynixContext.userId }, (tx) => tx.select({ publicRef: campaign.publicRef }).from(campaign));
    expect(all).toHaveLength(4);
  });
});

describe("the auth database role reads exactly what resolution needs", () => {
  it("leads_auth can read the membership columns and cannot write the table", async () => {
    const { userId } = await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const authDb = rig.dbs.roles.leads_auth.db;
    const readable = await authDb.select({ orgKind: member.orgKind }).from(member).where(eq(member.userId, userId));
    expect(readable).toEqual([{ orgKind: "client" }]);
    await expect(authDb.update(member).set({ status: "suspended" }).where(eq(member.userId, userId))).rejects.toThrow();
  });
});
