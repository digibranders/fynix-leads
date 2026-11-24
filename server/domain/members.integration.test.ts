import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD } from "@/server/auth/testing";
import { agencyAlias, member } from "@/server/db/schema";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { issueInvite } from "@/server/domain/invites";
import { reactivateMember, renameMember, setAgencyAlias, suspendMember } from "@/server/domain/members";
import { redeemInvite } from "@/server/domain/redeem-invite";
import { auditRowsFor, latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { readCurrentTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
  await publishApprovedTerms(rig);
});

const refusal = async (work: Promise<unknown>): Promise<DomainErrorCode> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const memberOf = async (userId: string) => {
  const [row] = await rig.dbs.owner.db.select().from(member).where(eq(member.userId, userId));
  if (row === undefined) throw new Error("no member");
  return row;
};
const ADDRESS = "203.0.113.70";

/** A real person: invited, redeemed, and signed in, so a session exists to be refused. */
async function realClient() {
  await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: "priya@kestrel.example", name: "Priya Nair", jobTitle: "Operations lead" });
  const redeemed = await redeemInvite(rig.deps(), { token: (await latestInviteLink(rig, "priya@kestrel.example")).token, password: GOOD_PASSWORD, acceptedTermsId: (await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client"))?.id ?? "", address: ADDRESS });
  if (redeemed.status !== "redeemed") throw new Error("not redeemed");
  const auth = rig.deps().authFactory(rig.dbs.roles.leads_auth.db);
  const services = { auth, publicDb: rig.dbs.roles.leads_public.db };
  const signedIn = await signInWithPassword(services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
  if (signedIn.status !== "signed-in") throw new Error("not signed in");
  const cookie = new Headers({ cookie: signedIn.headers.getSetCookie().map((line) => line.split(";")[0] ?? "").join("; ") });
  return { userId: redeemed.userId, services, resolve: () => resolveSessionContext({ reader: auth, authDb: rig.dbs.roles.leads_auth.db }, cookie) };
}

describe("suspendMember and reactivateMember", () => {
  it("suspending ends the person's access on the very next request, and reactivating gives it back", async () => {
    const person = await realClient();
    expect(await person.resolve()).not.toBeNull();
    const row = await memberOf(person.userId);

    expect(await suspendMember(rig.deps(), rig.actor, row.id)).toMatchObject({ status: "suspended", displayName: "Priya Nair" });
    expect(await person.resolve()).toBeNull();
    expect((await signInWithPassword(person.services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("invalid-credentials");

    expect(await reactivateMember(rig.deps(), rig.actor, row.id)).toMatchObject({ status: "active" });
    expect(await person.resolve()).toMatchObject({ kind: "client", userId: person.userId });
    expect((await signInWithPassword(person.services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });

  it("audits each change with the member's state before and after, and deletes nothing", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    await suspendMember(rig.deps(), rig.actor, row.id);
    await reactivateMember(rig.deps(), rig.actor, row.id);
    const audits = [...(await auditRowsFor(rig, "member.suspend")), ...(await auditRowsFor(rig, "member.reactivate"))];
    expect(audits).toMatchObject([
      { action: "member.suspend", subjectTable: "member", subjectId: row.id, before: { status: "active" }, after: { status: "suspended" } },
      { action: "member.reactivate", subjectId: row.id, before: { status: "suspended" }, after: { status: "active" } },
    ]);
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member)).toHaveLength(7);
  });

  it("refuses an admin suspending their own membership, a repeat, and an unknown member", async () => {
    const own = await memberOf(rig.actor.userId);
    expect(await refusal(suspendMember(rig.deps(), rig.actor, own.id))).toBe("cannot-suspend-self");
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await refusal(reactivateMember(rig.deps(), rig.actor, row.id))).toBe("invalid-transition");
    await suspendMember(rig.deps(), rig.actor, row.id);
    expect(await refusal(suspendMember(rig.deps(), rig.actor, row.id))).toBe("invalid-transition");
    expect(await refusal(suspendMember(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
    expect((await memberOf(rig.actor.userId)).status).toBe("active");
  });
});

describe("renameMember", () => {
  it("changes the display name only, and audits it", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await renameMember(rig.deps(), rig.actor, row.id, "  Priya N.  ")).toMatchObject({ displayName: "Priya N.", orgId: rig.world().kestrel.id });
    expect((await auditRowsFor(rig, "member.rename"))[0]).toMatchObject({ before: { displayName: "Priya Nair" }, after: { displayName: "Priya N." } });
  });

  it("refuses an empty name and an unknown member", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await refusal(renameMember(rig.deps(), rig.actor, row.id, "   "))).toBe("invalid-input");
    expect(await refusal(renameMember(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", "Name"))).toBe("not-found");
    expect((await memberOf(person.userId)).displayName).toBe("Priya Nair");
  });
});

describe("setAgencyAlias", () => {
  const agencyMember = async (index = 0) => {
    const rows = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).orderBy(member.displayName);
    const row = rows[index];
    if (row === undefined) throw new Error("no agency member");
    return row.id;
  };
  const aliasOf = async (memberId: string) => (await rig.dbs.owner.db.select({ alias: agencyAlias.alias }).from(agencyAlias).where(eq(agencyAlias.memberId, memberId)))[0]?.alias;

  it("gives an agency member an alias, then changes it, and audits both with the before state", async () => {
    const id = await agencyMember();
    expect(await setAgencyAlias(rig.deps(), rig.actor, id, "Rahul, Fynix")).toEqual({ alias: "Rahul, Fynix" });
    expect(await setAgencyAlias(rig.deps(), rig.actor, id, "Rahul V, Fynix")).toEqual({ alias: "Rahul V, Fynix" });
    expect(await aliasOf(id)).toBe("Rahul V, Fynix");
    expect(await rig.dbs.owner.db.select({ id: agencyAlias.id }).from(agencyAlias)).toHaveLength(1);
    expect(await auditRowsFor(rig, "agency_alias.set")).toMatchObject([
      { before: null, after: { memberId: id, alias: "Rahul, Fynix" } },
      { before: { memberId: id, alias: "Rahul, Fynix" }, after: { memberId: id, alias: "Rahul V, Fynix" } },
    ]);
  });

  it("lets a person change the case of their own alias, but not take another person's, whatever the case", async () => {
    const first = await agencyMember(0);
    const second = await agencyMember(1);
    await setAgencyAlias(rig.deps(), rig.actor, first, "Rahul, Fynix");
    await setAgencyAlias(rig.deps(), rig.actor, first, "RAHUL, Fynix");
    expect(await aliasOf(first)).toBe("RAHUL, Fynix");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, second, "rahul, fynix"))).toBe("alias-taken");
    expect(await aliasOf(second)).toBeUndefined();
  });

  it("refuses an alias that a live invite carries", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: "new@northgate.example", name: "New Person", jobTitle: "Operations lead", alias: "Promised, Fynix" });
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "promised, FYNIX"))).toBe("alias-taken");
  });

  it("refuses a client member, an alias that is too short or long, and an unknown member", async () => {
    const client = rig.world().users.find((candidate) => candidate.organisation.kind === "client");
    const [row] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, client?.id ?? ""));
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, row?.id ?? "", "Client, Fynix"))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "x"))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "y".repeat(61)))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", "Someone, Fynix"))).toBe("not-found");
  });
});
