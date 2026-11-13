import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAccountWithGrant } from "@/server/auth/create-account";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD } from "@/server/auth/testing";
import { account, agencyAlias, invite, member, session, termsAcceptance, user } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { captureErrorText } from "@/server/db/testing";
import { DomainError } from "@/server/domain/errors";
import { hashInviteToken } from "@/server/domain/invite-token";
import { issueInvite, previewInvite } from "@/server/domain/invites";
import { redeemInvite, type RedeemInput, type RedeemResult } from "@/server/domain/redeem-invite";
import { latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { publishTerms, readCurrentTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 1C's exit criterion, end to end: an invite becomes an accepted account. The first describe is the whole flow; the rest
 * are what must not happen.
 */

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

const ADDRESS = "203.0.113.60";
const CLIENT_EMAIL = "priya.nair@kestrel.example";
const AGENCY_EMAIL = "rahul@northgate.example";
const issueClient = () => issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: CLIENT_EMAIL, name: "Priya Nair" });
const issueAgency = () => issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: AGENCY_EMAIL, name: "Rahul Verma", alias: "Rahul, Fynix" });
const termsId = async (party: "client" | "agency" | "fynix"): Promise<string> => (await readCurrentTerms(rig.dbs.roles.leads_auth.db, party))?.id ?? "";
const redeem = async (email: string, party: "client" | "agency", overrides: Partial<RedeemInput> = {}): Promise<RedeemResult> =>
  redeemInvite(rig.deps(), { token: (await latestInviteLink(rig, email)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId(party), address: ADDRESS, ...overrides });
/** The seeded users, accounts and members: Fynix admin, Fynix staff, two clients, two agencies. */
const SEEDED_PEOPLE = 6;
const counts = async () => ({
  users: (await rig.dbs.owner.db.select({ id: user.id }).from(user)).length - SEEDED_PEOPLE,
  accounts: (await rig.dbs.owner.db.select({ id: account.id }).from(account)).length - SEEDED_PEOPLE,
  members: (await rig.dbs.owner.db.select({ id: member.id }).from(member)).length - SEEDED_PEOPLE,
  acceptances: (await rig.dbs.owner.db.select({ id: termsAcceptance.id }).from(termsAcceptance)).length,
  aliases: (await rig.dbs.owner.db.select({ id: agencyAlias.id }).from(agencyAlias)).length,
});
const NOTHING = { users: 0, accounts: 0, members: 0, acceptances: 0, aliases: 0 };
const inviteRow = async (email: string) => (await rig.dbs.owner.db.select().from(invite).where(eq(invite.email, email)))[0];

describe("an invite becomes an accepted account", () => {
  it("creates the account, the membership with the invited name, the acceptance of the current terms and the used invite, and the person can sign in", async () => {
    await issueClient();
    const redeemed = await redeem(CLIENT_EMAIL, "client");
    expect(redeemed).toMatchObject({ status: "redeemed", email: CLIENT_EMAIL, party: "client" });
    if (redeemed.status !== "redeemed") throw new Error("not redeemed");

    const [created] = await rig.dbs.owner.db.select().from(user).where(eq(user.id, redeemed.userId));
    expect(created).toMatchObject({ email: CLIENT_EMAIL, name: "Priya Nair" });
    const [membership] = await rig.dbs.owner.db.select().from(member).where(eq(member.userId, redeemed.userId));
    expect(membership).toMatchObject({ orgId: rig.world().kestrel.id, orgKind: "client", role: "member", displayName: "Priya Nair", status: "active" });
    const [acceptance] = await rig.dbs.owner.db.select().from(termsAcceptance).where(eq(termsAcceptance.userId, redeemed.userId));
    expect(acceptance).toMatchObject({ documentId: await termsId("client"), party: "client", networkAddress: ADDRESS });
    expect(acceptance?.acceptedAt).toBeInstanceOf(Date);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeInstanceOf(Date);
    expect((await counts()).aliases).toBe(0);

    const auth = rig.deps().authFactory(rig.dbs.roles.leads_auth.db);
    const services = { auth, publicDb: rig.dbs.roles.leads_public.db };
    const signedIn = await signInWithPassword(services, { email: CLIENT_EMAIL, password: GOOD_PASSWORD, address: ADDRESS });
    expect(signedIn.status).toBe("signed-in");
    if (signedIn.status !== "signed-in") throw new Error("not signed in");
    const cookie = new Headers({ cookie: signedIn.headers.getSetCookie().map((line) => line.split(";")[0] ?? "").join("; ") });
    expect(await resolveSessionContext({ reader: auth, authDb: rig.dbs.roles.leads_auth.db }, cookie)).toMatchObject({ kind: "client", role: "leads_client", orgId: rig.world().kestrel.id, userId: redeemed.userId, name: "Priya Nair" });
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, redeemed.userId))).toHaveLength(1);
  });

  it("creates an agency user's alias with the account", async () => {
    await issueAgency();
    const redeemed = await redeem(AGENCY_EMAIL, "agency");
    expect(redeemed.status).toBe("redeemed");
    const [membership] = await rig.dbs.owner.db.select().from(member).where(eq(member.displayName, "Rahul Verma"));
    const aliases = await rig.dbs.owner.db.select().from(agencyAlias);
    expect(aliases).toMatchObject([{ memberId: membership?.id, alias: "Rahul, Fynix", memberOrgKind: "agency" }]);
  });

  it("uses the password the person chose: the stored hash is not the password, and a different password does not sign in", async () => {
    await issueClient();
    await redeem(CLIENT_EMAIL, "client", { password: NEW_PASSWORD });
    const stored = await rig.dbs.owner.db.select({ password: account.password }).from(account).innerJoin(user, eq(user.id, account.userId)).where(eq(user.email, CLIENT_EMAIL));
    expect(stored[0]?.password).toBeTruthy();
    expect(stored[0]?.password).not.toContain(NEW_PASSWORD);
    const services = { auth: rig.deps().authFactory(rig.dbs.roles.leads_auth.db), publicDb: rig.dbs.roles.leads_public.db };
    expect((await signInWithPassword(services, { email: CLIENT_EMAIL, password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("invalid-credentials");
    expect((await signInWithPassword(services, { email: CLIENT_EMAIL, password: NEW_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });

  it("is single use: the same link answers redeemed afterwards, for the page and for a second redemption, and creates nothing more", async () => {
    await issueClient();
    const { token } = await latestInviteLink(rig, CLIENT_EMAIL);
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "redeemed" });
    expect(await previewInvite(rig.deps(), { token, address: ADDRESS })).toEqual({ status: "redeemed" });
    expect(await counts()).toEqual({ ...NOTHING, users: 1, accounts: 1, members: 1, acceptances: 1 });
  });

  it("two redemptions of one invite at the same moment: exactly one account", async () => {
    await issueClient();
    const input = { token: (await latestInviteLink(rig, CLIENT_EMAIL)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("client"), address: ADDRESS };
    const results = await Promise.all([redeemInvite(rig.deps(), input), redeemInvite(rig.deps(), input)]);
    expect(results.map((result) => result.status).sort()).toEqual(["invite-unavailable", "redeemed"]);
    expect(await counts()).toEqual({ ...NOTHING, users: 1, accounts: 1, members: 1, acceptances: 1 });
  });

  it("takes the address and the name from the invite and not from anything the caller sends", async () => {
    await issueClient();
    const redeemed = await redeem(CLIENT_EMAIL, "client", { ...({ email: "attacker@example.com", name: "Someone Else" } as object) });
    expect(redeemed).toMatchObject({ status: "redeemed", email: CLIENT_EMAIL });
    expect((await rig.dbs.owner.db.select({ email: user.email }).from(user).where(eq(user.email, "attacker@example.com")))).toEqual([]);
  });
});

describe("a link that cannot be used creates nothing", () => {
  it("expired: by the database clock, and by the application's clock", async () => {
    const issued = await issueClient();
    rig.clock.now = new Date(rig.clock.now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "expired" });
    rig.clock.now = new Date();
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invite.id, issued.inviteId));
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "expired" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("revoked", async () => {
    const issued = await issueClient();
    await rig.dbs.owner.db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "revoked" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("replaced by a newer invite: the old link is revoked and the new one works", async () => {
    await issueClient();
    const oldToken = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { token: oldToken })).toEqual({ status: "invite-unavailable", reason: "revoked" });
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });

  it("never issued, or malformed", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { token: "A".repeat(43) })).toEqual({ status: "invite-unavailable", reason: "invalid" });
    expect(await redeem(CLIENT_EMAIL, "client", { token: "not a token" })).toEqual({ status: "invite-unavailable", reason: "invalid" });
    expect(await counts()).toEqual(NOTHING);
  });
});

describe("a password that is refused leaves the invite usable and nothing behind", () => {
  it.each([
    ["too short", "short", { status: "weak-password", message: "Use at least 8 characters." }],
    ["too long", "x".repeat(129), { status: "weak-password", message: "Use at most 128 characters." }],
  ])("%s", async (_label, password, expected) => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { password })).toEqual(expected);
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });

  it("found in a breach", async () => {
    await issueClient();
    rig.breach.breached.add(GOOD_PASSWORD);
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "weak-password", message: "That password has appeared in a data breach. Choose a different one." });
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client", { password: NEW_PASSWORD })).status).toBe("redeemed");
  });

  it("the breach service is down: nothing is accepted unchecked, and the invite works once it is back", async () => {
    await issueClient();
    rig.breach.unavailable = true;
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "check-unavailable" });
    expect(await counts()).toEqual(NOTHING);
    rig.breach.unavailable = false;
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });
});

describe("the terms", () => {
  it("must be ticked: with no acceptance nothing is created", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: null })).toEqual({ status: "terms-not-accepted" });
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: "" })).toEqual({ status: "terms-not-accepted" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("must be the current version: a version published after the page was shown is refused, and the new one is accepted", async () => {
    await issueClient();
    const shown = await termsId("client");
    await publishTerms(rig.deps(), rig.actor, { party: "client", title: "Terms for client users, version two", body: "Changed." });
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: shown })).toEqual({ status: "terms-changed" });
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
    const [acceptance] = await rig.dbs.owner.db.select().from(termsAcceptance);
    expect(acceptance?.documentId).toBe(await termsId("client"));
  });

  it("must be the party's own: a client cannot accept the agency terms", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: await termsId("agency") })).toEqual({ status: "terms-changed" });
    expect(await counts()).toEqual(NOTHING);
  });
});

describe("everything or nothing", () => {
  it("an address that already has an account: the invite is not used up, and no second account appears", async () => {
    await issueClient();
    await createAccountWithGrant(rig.deps().authFactory(rig.dbs.roles.leads_auth.db), rig.dbs.roles.leads_auth.db, { email: CLIENT_EMAIL, name: "Existing", password: GOOD_PASSWORD });
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "account-exists" });
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.displayName, "Priya Nair"))).toEqual([]);
  });

  it("a failure after the account was created takes the account back with it", async () => {
    await issueAgency();
    // Someone else takes the alias between the invite and the redemption, so the alias insert fails after the account exists.
    const [other] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).limit(1);
    await rig.dbs.owner.db.insert(agencyAlias).values({ memberId: other?.id ?? "", alias: "Rahul, Fynix" });
    const input = { token: (await latestInviteLink(rig, AGENCY_EMAIL)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("agency"), address: ADDRESS };
    await expect(redeemInvite(rig.deps(), input)).rejects.toBeInstanceOf(DomainError);
    expect(await counts()).toEqual({ ...NOTHING, aliases: 1 });
    expect((await inviteRow(AGENCY_EMAIL))?.redeemedAt).toBeNull();
    expect(await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, AGENCY_EMAIL))).toEqual([]);
  });
});

describe("rate limits", () => {
  it("stop a network after ten attempts in an hour, before the lookup: even the right password is refused", async () => {
    await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    const attempt = (address: string, password = "short") => redeemInvite(rig.deps(), { token, password, acceptedTermsId: "x", address });
    for (let index = 1; index <= 10; index += 1) expect((await attempt("203.0.113.90", GOOD_PASSWORD)).status, `attempt ${index}`).toBe("terms-changed");
    expect((await attempt("203.0.113.90", GOOD_PASSWORD)).status).toBe("rate-limited");
    expect(await counts()).toEqual(NOTHING);
  });

  it("stop one invite after ten attempts from any networks", async () => {
    await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    for (let index = 1; index <= 10; index += 1) await redeemInvite(rig.deps(), { token, password: "x", acceptedTermsId: "x", address: `203.0.113.${100 + index}` });
    const blocked = await redeemInvite(rig.deps(), { token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("client"), address: "203.0.113.150" });
    expect(blocked.status).toBe("rate-limited");
    expect(await counts()).toEqual(NOTHING);
  });

  it("count a malformed token too, so scanning costs requests", async () => {
    for (let index = 1; index <= 10; index += 1) expect((await redeemInvite(rig.deps(), { token: "junk", password: "x", acceptedTermsId: null, address: "203.0.113.160" })).status).toBe("invite-unavailable");
    expect((await redeemInvite(rig.deps(), { token: "junk", password: "x", acceptedTermsId: null, address: "203.0.113.160" })).status).toBe("rate-limited");
  });
});

describe("what leads_auth can and cannot do to members, whatever the service does", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;
  const newUser = async (email: string): Promise<string> => (await createAccountWithGrant(rig.deps().authFactory(authDb()), authDb(), { email, name: "N", password: GOOD_PASSWORD })).userId;

  it("may add a member only for a user whose invite was redeemed, in that invite's organisation, role and name", async () => {
    const issued = await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    const [row] = await rig.dbs.owner.db.select().from(invite).where(eq(invite.id, issued.inviteId));
    const person = await newUser(CLIENT_EMAIL);
    const add = (values: Partial<typeof member.$inferInsert>) =>
      withInviteHash(authDb(), hashInviteToken(token), async (tx) => {
        await tx.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, issued.inviteId));
        await tx.insert(member).values({ userId: person, orgId: row?.orgId ?? "", orgKind: "client", role: "member", displayName: "Priya Nair", ...values });
      });
    const refused = 'new row violates row-level security policy for table "member"';
    expect(await captureErrorText(add({ orgId: rig.world().halden.id }))).toContain(refused);
    expect(await captureErrorText(add({ role: "manager" }))).toContain(refused);
    expect(await captureErrorText(add({ displayName: "Someone Else" }))).toContain(refused);
    expect(await captureErrorText(add({ status: "suspended" }))).toContain(refused);
    expect(await captureErrorText(add({ orgId: rig.world().fynix.id, orgKind: "fynix" }))).toContain(refused);
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person))).toEqual([]);
    await add({});
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person))).toHaveLength(1);
  });

  it("cannot add a member for a user with no redeemed invite, with no invite in view at all", async () => {
    const person = await newUser("stranger@example.com");
    const message = await captureErrorText(authDb().insert(member).values({ userId: person, orgId: rig.world().kestrel.id, orgKind: "client", displayName: "Stranger" }));
    expect(message).toContain('new row violates row-level security policy for table "member"');
  });

  it("cannot change a member, give an alias to anyone but the redeemed invite's person, or read the aliases", async () => {
    const [existing] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).limit(1);
    expect(await captureErrorText(authDb().update(member).set({ status: "suspended" }))).toContain("permission denied for table member");
    expect(await captureErrorText(authDb().insert(agencyAlias).values({ memberId: existing?.id ?? "", alias: "Sneaky, Fynix" }))).toContain('row-level security policy for table "agency_alias"');
    expect(await captureErrorText(authDb().select({ alias: agencyAlias.alias }).from(agencyAlias))).toContain("permission denied for table agency_alias");
  });
});
