import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agencyAlias, emailOutbox, invite, member } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { hashInviteToken } from "@/server/domain/invite-token";
import { issueInvite, listInvites, previewInvite, resendInvite, revokeInvite } from "@/server/domain/invites";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { auditRowsFor, latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { publishTerms } from "@/server/domain/terms";
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
const CLIENT_INVITE = () => ({ organisationId: rig.world().kestrel.id, email: "Priya.Nair@Kestrel.example", name: "Priya Nair", jobTitle: "Operations lead" });
const AGENCY_INVITE = () => ({ organisationId: rig.world().northgate.id, email: "rahul@northgate.example", name: "Rahul Verma", jobTitle: "Operations lead", alias: "Rahul, Fynix" });
const invites = () => rig.dbs.owner.db.select().from(invite).orderBy(invite.createdAt);
const mails = () => rig.dbs.owner.db.select().from(emailOutbox).orderBy(emailOutbox.createdAt);
const SOME_ADDRESS = "203.0.113.50";

describe("issueInvite", () => {
  it("stores the address in lower case, the name, the role and a hash of the token that is valid for seven days", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const [row] = await invites();
    expect(row).toMatchObject({ id: issued.inviteId, orgId: rig.world().kestrel.id, orgKind: "client", email: "priya.nair@kestrel.example", name: "Priya Nair", role: "member", alias: null, redeemedAt: null, revokedAt: null, createdBy: rig.actor.userId });
    expect(row?.tokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row?.expiresAt.getTime()).toBe(rig.clock.now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(issued.expiresAt).toEqual(row?.expiresAt);
  });

  it("queues the email in the same transaction: the link carries the token, the stored copy does not, and nothing stores the token itself", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const { link, token } = await latestInviteLink(rig, "priya.nair@kestrel.example");
    expect(link).toBe(`http://localhost:3020/accept-invite?token=${token}`);
    const [row] = await invites();
    expect(row?.tokenHash).toBe(hashInviteToken(token));
    const [mail] = await mails();
    expect(mail).toMatchObject({ recipient: "priya.nair@kestrel.example", template: "invite", status: "pending", inviteId: issued.inviteId, subject: "You are invited to Fynix Leads", params: { name: "Priya Nair", organisationName: "Kestrel Logistics Ltd" } });
    expect(mail?.body).toContain("Hello Priya Nair,");
    expect(mail?.body).not.toContain(token);
    const everythingElse = JSON.stringify([await invites(), await auditRowsFor(rig), { ...mail, link: null }]);
    expect(everythingElse).not.toContain(token);
  });

  it("audits the issue with the person, the organisation and the expiry, and never the token, its hash or the link", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const { token } = await latestInviteLink(rig, "priya.nair@kestrel.example");
    const [row] = await invites();
    const audits = await auditRowsFor(rig, "invite.issue");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "invite", before: null, after: { orgId: rig.world().kestrel.id, email: "priya.nair@kestrel.example", name: "Priya Nair", role: "member", alias: null } });
    const text = JSON.stringify(audits);
    for (const secret of [token, row?.tokenHash ?? "x", "accept-invite"]) expect(text).not.toContain(secret);
  });

  it("issues an agency invite with its alias", async () => {
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const [row] = await invites();
    expect(row).toMatchObject({ orgKind: "agency", alias: "Rahul, Fynix" });
  });

  it("revokes the live invite for the same address in the same transaction, cancels its unsent email, and leaves one live invite", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const firstLink = (await latestInviteLink(rig, "priya.nair@kestrel.example")).token;
    const second = await issueInvite(rig.deps(), rig.actor, { ...CLIENT_INVITE(), name: "Priya N" });
    const [old, current] = await invites();
    expect(old).toMatchObject({ id: first.inviteId, name: "Priya Nair" });
    expect(old?.revokedAt).toBeInstanceOf(Date);
    expect(current).toMatchObject({ id: second.inviteId, name: "Priya N", revokedAt: null });
    const [oldMail, newMail] = await mails();
    expect(oldMail).toMatchObject({ status: "cancelled", link: null, lastError: "the invite was revoked" });
    expect(newMail).toMatchObject({ status: "pending" });
    expect((await latestInviteLink(rig, "priya.nair@kestrel.example")).token).not.toBe(firstLink);
    expect((await auditRowsFor(rig)).map((entry) => entry.action).slice(-3)).toEqual(["invite.issue", "invite.revoke", "invite.issue"]);
  });

  it("leaves a message that was already sent alone when the invite is replaced", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(emailOutbox).set({ status: "sent", link: null });
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    expect((await mails()).map((mail) => mail.status)).toEqual(["sent", "pending"]);
  });

  it("is all or nothing: a refusal after the old invite was revoked puts it back", async () => {
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    await issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), email: "other@northgate.example", name: "Other Person", alias: "Other, Fynix" });
    // Re-inviting the first person under the second person's alias fails at the alias check, after the revoke.
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), alias: "Other, Fynix" }))).toBe("alias-taken");
    const live = (await invites()).filter((row) => row.revokedAt === null);
    expect(live.map((row) => row.email).sort()).toEqual(["other@northgate.example", "rahul@northgate.example"]);
    expect((await mails()).map((mail) => mail.status)).toEqual(["pending", "pending"]);
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["terms.publish", "terms.publish", "terms.publish", "invite.issue", "invite.issue"]);
  });

  it("refuses an address that already has an account, whatever its case, and an alias that is held or promised", async () => {
    const taken = rig.world().users[1]?.email ?? "";
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...CLIENT_INVITE(), email: taken.toUpperCase() }))).toBe("email-in-use");
    const person = rig.world().users.find((candidate) => candidate.organisation.kind === "agency");
    if (person === undefined) throw new Error("no agency user");
    const [seededMember] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person.id));
    await rig.dbs.owner.db.insert(agencyAlias).values({ memberId: seededMember?.id ?? "", alias: "Held, Fynix" });
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), alias: "held, FYNIX" }))).toBe("alias-taken");
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), email: "second@northgate.example", alias: "RAHUL, Fynix" }))).toBe("alias-taken");
    expect(await invites()).toHaveLength(1);
  });

  it.each([
    ["an invite with a phone that is not a number", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), phone: "call me maybe" }), "invalid-input"],
    ["a client invite with an alias", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), alias: "Priya, Fynix" }), "invalid-input"],
    ["a Fynix invite with an alias", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), organisationId: rig.world().fynix.id, alias: "Priya, Fynix" }), "invalid-input"],
    ["an organisation that does not exist", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), organisationId: "99999999-9999-4999-8999-999999999999" }), "not-found"],
    ["an address that is not an address", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), email: "not an address" }), "invalid-input"],
    ["a role that does not exist", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), role: "owner" }), "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, make, code) => {
    expect(await refusal(issueInvite(rig.deps(), rig.actor, make() as never))).toBe(code);
    expect(await invites()).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("refuses an archived organisation", async () => {
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "archived");
    expect(await refusal(issueInvite(rig.deps(), rig.actor, CLIENT_INVITE()))).toBe("organisation-archived");
  });

  it("refuses to invite someone when their party has no current terms to accept", async () => {
    await rig.reset();
    expect(await refusal(issueInvite(rig.deps(), rig.actor, CLIENT_INVITE()))).toBe("no-current-terms");
  });

  it("gate G2: refuses while the current terms are placeholder text on an https deployment, and allows it in development", async () => {
    await rig.reset();
    await seedPlaceholderTerms(rig.dbs.owner.db);
    expect(await refusal(issueInvite(rig.deps({ allowPlaceholderTerms: false }), rig.actor, CLIENT_INVITE()))).toBe("placeholder-terms");
    expect(await invites()).toEqual([]);
    await issueInvite(rig.deps({ allowPlaceholderTerms: true }), rig.actor, CLIENT_INVITE());
    expect(await invites()).toHaveLength(1);
    await publishTerms(rig.deps(), rig.actor, { party: "agency", title: "Approved agency terms", body: "Approved." });
    await issueInvite(rig.deps({ allowPlaceholderTerms: false }), rig.actor, AGENCY_INVITE());
    expect(await invites()).toHaveLength(2);
  });
});

describe("two issues for one address at once", () => {
  /**
   * Holds a table lock so that both issues stop at their first write to `invite`, then releases them together. Each then
   * revokes nothing (no live invite is committed yet) and inserts, so the second insert meets the first one's index entry.
   */
  const issueTwiceTogether = async (): Promise<PromiseSettledResult<unknown>[]> => {
    let pending: Promise<unknown>[] = [];
    await rig.dbs.owner.db.transaction(async (tx) => {
      await tx.execute(sql`lock table invite in share row exclusive mode`);
      pending = [issueInvite(rig.deps(), rig.actor, CLIENT_INVITE()), issueInvite(rig.deps(), rig.actor, CLIENT_INVITE())];
      for (let waited = 0; waited < 100; waited += 1) {
        const waiting = await rig.dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from pg_locks where not granted and relation = 'invite'::regclass`);
        if ((waiting.rows[0]?.n ?? 0) >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
    return Promise.allSettled(pending);
  };

  it("lets exactly one win; the other gets a DomainError that carries no row data", async () => {
    const outcomes = await issueTwiceTogether();
    const winners = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const losers = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const reason = losers[0]?.reason as unknown;
    expect(reason).toBeInstanceOf(DomainError);
    expect((reason as DomainError).code).toBe("invite-conflict");
    const [stored] = await invites();
    const everything = `${(reason as Error).message} ${(reason as Error).stack ?? ""} ${JSON.stringify(reason)} ${String((reason as Error).cause)}`;
    for (const secret of [stored?.tokenHash ?? "missing", "priya.nair@kestrel.example", "Priya Nair"]) expect(everything).not.toContain(secret);
    expect(await invites()).toHaveLength(1);
    expect(await mails()).toHaveLength(1);
    expect(await auditRowsFor(rig, "invite.issue")).toHaveLength(1);
  });
});

describe("resendInvite and revokeInvite", () => {
  it("resends with a new link: the old invite is revoked, its unsent email cancelled, and the person, role and alias carry over", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const firstToken = (await latestInviteLink(rig, "rahul@northgate.example")).token;
    const second = await resendInvite(rig.deps(), rig.actor, first.inviteId);
    expect(second.inviteId).not.toBe(first.inviteId);
    const [old, current] = await invites();
    expect(old?.revokedAt).toBeInstanceOf(Date);
    expect(current).toMatchObject({ email: "rahul@northgate.example", name: "Rahul Verma", alias: "Rahul, Fynix", orgKind: "agency", revokedAt: null });
    expect((await latestInviteLink(rig, "rahul@northgate.example")).token).not.toBe(firstToken);
    expect((await mails()).map((mail) => mail.status)).toEqual(["cancelled", "pending"]);
  });

  it("resends an invite that has run out", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) });
    const second = await resendInvite(rig.deps(), rig.actor, first.inviteId);
    expect(second.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to resend an invite that was used, or one that does not exist", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ redeemedAt: new Date() });
    expect(await refusal(resendInvite(rig.deps(), rig.actor, first.inviteId))).toBe("invite-not-live");
    expect(await refusal(resendInvite(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
  });

  it("revokes a live invite and cancels its email, and audits it", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await revokeInvite(rig.deps(), rig.actor, issued.inviteId);
    const [row] = await invites();
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect((await mails())[0]).toMatchObject({ status: "cancelled", link: null });
    const [audit] = await auditRowsFor(rig, "invite.revoke");
    expect(audit).toMatchObject({ subjectId: issued.inviteId, before: { email: "priya.nair@kestrel.example" }, after: { reason: "revoked by Fynix" } });
  });

  it("cannot revoke an invite twice, a used invite or one that does not exist", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await revokeInvite(rig.deps(), rig.actor, issued.inviteId);
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, issued.inviteId))).toBe("invite-not-live");
    const second = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, second.inviteId));
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, second.inviteId))).toBe("invite-not-live");
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
  });
});

describe("previewInvite", () => {
  const link = async () => (await latestInviteLink(rig, "priya.nair@kestrel.example")).token;

  it("shows a pending invite to whoever holds the link: the name, the address, the party and the current terms", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const preview = await previewInvite(rig.deps(), { token: await link(), address: SOME_ADDRESS });
    expect(preview).toMatchObject({ status: "pending", name: "Priya Nair", email: "priya.nair@kestrel.example", party: "client", terms: { party: "client", version: 1, placeholder: false, title: "Terms for client users" } });
  });

  it("answers invalid, with nothing about any invite, for a token that is malformed or was never issued", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    expect(await previewInvite(rig.deps(), { token: "short", address: SOME_ADDRESS })).toEqual({ status: "invalid" });
    expect(await previewInvite(rig.deps(), { token: "A".repeat(43), address: SOME_ADDRESS })).toEqual({ status: "invalid" });
  });

  it("says why a link no longer works, without any personal data: expired, revoked or used", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "expired" });
    await rig.dbs.owner.db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "revoked" });
    await rig.dbs.owner.db.update(invite).set({ revokedAt: null, redeemedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "redeemed" });
  });

  it("uses the clock it was given for expiry", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    rig.clock.now = new Date(rig.clock.now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "expired" });
  });

  it("limits lookups per network before it looks anything up, and counts a malformed token like any other", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    for (let attempt = 1; attempt <= 30; attempt += 1) expect((await previewInvite(rig.deps(), { token: "x", address: "203.0.113.77" })).status, `attempt ${attempt}`).toBe("invalid");
    expect((await previewInvite(rig.deps(), { token, address: "203.0.113.77" })).status).toBe("rate-limited");
    expect((await previewInvite(rig.deps(), { token, address: "203.0.113.78" })).status).toBe("pending");
  });
});

describe("what the database itself allows on invite", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;

  it("shows leads_auth no invite unless the transaction names one's hash, and then only that one", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    expect(await queryAs(authDb(), null, "select count(*)::int as n from invite")).toEqual([{ n: 0 }]);
    const [one] = (await invites()).filter((row) => row.id === first.inviteId);
    const seen = await withInviteHash(authDb(), one?.tokenHash ?? "", (tx) => tx.select({ email: invite.email }).from(invite));
    expect(seen).toEqual([{ email: "priya.nair@kestrel.example" }]);
  });

  it("lets leads_auth redeem the named invite and nothing else, and refuses an invite that is expired, revoked or used, whatever the service checked", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const [client, agency] = await invites();
    const redeem = (hash: string) => withInviteHash(authDb(), hash, (tx) => tx.update(invite).set({ redeemedAt: new Date() }).returning({ id: invite.id }));

    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invite.id, client?.id ?? ""));
    expect(await redeem(client?.tokenHash ?? "")).toEqual([]);
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() + 1000) , revokedAt: new Date() }).where(eq(invite.id, client?.id ?? ""));
    expect(await redeem(client?.tokenHash ?? "")).toEqual([]);

    expect(await redeem(agency?.tokenHash ?? "")).toEqual([{ id: agency?.id }]);
    expect(await redeem(agency?.tokenHash ?? "")).toEqual([]);
    expect((await invites()).map((row) => row.redeemedAt !== null)).toEqual([false, true]);
  });

  it("allows one live invite per address, even for an insert that bypasses the service", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const [row] = await invites();
    const message = await captureErrorText(rig.dbs.owner.db.insert(invite).values({ orgId: row?.orgId ?? "", orgKind: "client", email: row?.email ?? "", name: "Dup", tokenHash: "b".repeat(43), expiresAt: new Date(Date.now() + 1000), createdBy: rig.actor.userId }));
    expect(message).toContain("invite_one_live");
  });

  it("lets Fynix read everything about an invite except the token hash, and change only revoked_at", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const scope = { orgId: null, userId: rig.actor.userId };
    const fynix = rig.dbs.roles.leads_fynix.db;
    expect(await queryAs(fynix, scope, "select email, name, alias, expires_at is not null as has_expiry from invite")).toEqual([{ email: "priya.nair@kestrel.example", name: "Priya Nair", alias: null, has_expiry: true }]);
    for (const statement of ["select token_hash from invite", "select * from invite", "update invite set email = 'x@example.com'", "update invite set token_hash = 'x'", "update invite set redeemed_at = now()", "delete from invite"]) {
      expect(await captureErrorText(queryAs(fynix, scope, statement)), statement).toContain("permission denied for table invite");
    }
  });
});

describe("issueInvite, phase 1 people rules", () => {
  it("keeps the job title and the phone on the invite and the audit row", async () => {
    await issueInvite(rig.deps(), rig.actor, { ...CLIENT_INVITE(), phone: "+44 20 7946 0000" });
    const [row] = await invites();
    expect(row).toMatchObject({ jobTitle: "Operations lead", phone: "+44 20 7946 0000" });
    const [audit] = await auditRowsFor(rig, "invite.issue");
    expect(audit?.after).toMatchObject({ jobTitle: "Operations lead", phone: "+44 20 7946 0000" });
  });

  it("uses the person's own name as the alias of an agency invite when none is given", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: "rahul@northgate.example", name: "Rahul Verma", jobTitle: "Account director" });
    const [row] = await invites();
    expect(row?.alias).toBe("Rahul Verma");
  });

  it("refuses a second agency person whose own name is already an alias", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: "a@northgate.example", name: "Sam Lee", jobTitle: "Director" });
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: "b@northgate.example", name: "Sam Lee", jobTitle: "Analyst" }))).toBe("alias-taken");
  });

  it("invites Fynix admins and staff into the Fynix organisation: admin is stored as manager and staff as member", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().fynix.id, email: "boss@fynix.example", name: "Boss Person", jobTitle: "Director", role: "admin" });
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().fynix.id, email: "helper@fynix.example", name: "Helper Person", jobTitle: "Analyst", role: "staff" });
    const rows = await invites();
    expect(rows.map((row) => [row.orgKind, row.role, row.alias])).toEqual([["fynix", "manager", null], ["fynix", "member", null]]);
  });

  it("refuses a Fynix invite from staff", async () => {
    expect(await refusal(issueInvite(rig.deps(), rig.staffActor, { organisationId: rig.world().fynix.id, email: "x@fynix.example", name: "X Person", jobTitle: "Analyst", role: "staff" }))).toBe("admin-required");
  });

  it("lists every invite with its organisation, its state and who invited, and never a token or hash", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    await revokeInvite(rig.deps(), rig.actor, first.inviteId);
    const listed = await listInvites(rig.deps(), rig.staffActor);
    expect(listed.map((row) => [row.email, row.state, row.organisationName])).toEqual([
      ["rahul@northgate.example", "pending", "Northgate Leads Ltd"],
      ["priya.nair@kestrel.example", "revoked", "Kestrel Logistics Ltd"],
    ]);
    expect(listed[0]).toMatchObject({ jobTitle: "Operations lead", invitedBy: rig.world().users[0]?.name });
    expect(JSON.stringify(listed)).not.toMatch(/token/i);
  });
});

