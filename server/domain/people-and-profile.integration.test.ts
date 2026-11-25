import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GOOD_PASSWORD } from "@/server/auth/testing";
import { campaign, campaignShare, emailOutbox, invite, member, organisation, termsDocument } from "@/server/db/schema";
import type { Database } from "@/server/db/pool";
import { captureErrorText, queryAs } from "@/server/db/testing";
import type { TenantActor } from "@/server/domain/alias-identity";
import { issueInvite, issueTenantInvite } from "@/server/domain/invites";
import { updateMemberDetails, updateOwnMemberDetails } from "@/server/domain/members";
import { addCollateral, createOrganisation, removeCollateral, updateClientProfile } from "@/server/domain/organisations";
import { redeemInvite } from "@/server/domain/redeem-invite";
import { createPartnerAgency } from "@/server/domain/coordinators";
import { latestInviteLink, publishApprovedTerms, refusal } from "@/server/domain/test-helpers";
import { readCurrentTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 1 chunk A, end to end against the real roles: the people fields, who may invite whom, who may edit a person, and who may read a
 * client's profile. The leak tests at the end are the roadmap's assumption: an agency never reads a client person's email, phone or job title,
 * and never writes a profile.
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

/** Makes a seeded person a manager (the seed gives clients and agencies one ordinary user each) and returns their tenant identity. */
async function managerOf(organisationId: string): Promise<TenantActor> {
  const [row] = await rig.dbs.owner.db.select({ userId: member.userId, orgKind: member.orgKind }).from(member).where(eq(member.orgId, organisationId));
  if (row === undefined || row.orgKind === "fynix") throw new Error("No tenant person is seeded for that organisation");
  await rig.dbs.owner.db.update(member).set({ role: "manager" }).where(eq(member.userId, row.userId));
  return { userId: row.userId, orgId: organisationId, orgKind: row.orgKind, role: "manager" };
}
const ordinaryOf = async (organisationId: string): Promise<TenantActor> => {
  const actor = await managerOf(organisationId);
  await rig.dbs.owner.db.update(member).set({ role: "member" }).where(eq(member.userId, actor.userId));
  return { ...actor, role: "member" };
};
const clientDb = () => rig.dbs.roles.leads_client.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const asTenant = (actor: TenantActor) => ({ orgId: actor.orgId, userId: actor.userId });
const memberIdOf = async (organisationId: string): Promise<string> => {
  const [row] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgId, organisationId));
  if (row === undefined) throw new Error("No member");
  return row.id;
};
const JOB = { jobTitle: "Operations lead" };

describe("updateMemberDetails, by a Fynix admin", () => {
  it("changes name, job title and phone, clears the phone with null, and audits each change", async () => {
    const id = await memberIdOf(rig.world().kestrel.id);
    const changed = await updateMemberDetails(rig.deps(), rig.actor, id, { displayName: "Priya Nair", jobTitle: "Head of Ops", phone: "+44 20 7946 0000" });
    expect(changed).toMatchObject({ displayName: "Priya Nair", jobTitle: "Head of Ops", phone: "+44 20 7946 0000" });
    expect(await updateMemberDetails(rig.deps(), rig.actor, id, { phone: null })).toMatchObject({ phone: null, jobTitle: "Head of Ops" });
    const audits = await rig.dbs.owner.db.query.auditLog.findMany({ where: (table, { eq: same }) => same(table.action, "member.update_details") });
    expect(audits).toHaveLength(2);
  });

  it("refuses staff, a change that changes nothing, and a phone that is not a number", async () => {
    const id = await memberIdOf(rig.world().kestrel.id);
    expect((await refusal(updateMemberDetails(rig.deps(), rig.staffActor, id, { jobTitle: "x" }))).code).toBe("admin-required");
    expect((await refusal(updateMemberDetails(rig.deps(), rig.actor, id, {}))).code).toBe("invalid-input");
    expect((await refusal(updateMemberDetails(rig.deps(), rig.actor, id, { phone: "abc" }))).code).toBe("invalid-input");
  });
});

describe("updateOwnMemberDetails, by a client manager", () => {
  it("changes a person of their own client", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    const id = await memberIdOf(rig.world().kestrel.id);
    await updateOwnMemberDetails(clientDb(), actor, id, { jobTitle: "Head of Ops", phone: "+44 20 7946 0001" });
    const [row] = await rig.dbs.owner.db.select({ jobTitle: member.jobTitle, phone: member.phone }).from(member).where(eq(member.id, id));
    expect(row).toEqual({ jobTitle: "Head of Ops", phone: "+44 20 7946 0001" });
  });

  it("refuses an ordinary person, an agency, and a person of another client (not found, whatever the id)", async () => {
    const ordinary = await ordinaryOf(rig.world().kestrel.id);
    const own = await memberIdOf(rig.world().kestrel.id);
    expect((await refusal(updateOwnMemberDetails(clientDb(), ordinary, own, { jobTitle: "x" }))).code).toBe("not-authorised");
    const agency = await managerOf(rig.world().northgate.id);
    expect((await refusal(updateOwnMemberDetails(agencyDb(), agency, await memberIdOf(rig.world().northgate.id), { jobTitle: "x" }))).code).toBe("not-authorised");
    const manager = await managerOf(rig.world().kestrel.id);
    expect((await refusal(updateOwnMemberDetails(clientDb(), manager, await memberIdOf(rig.world().halden.id), { jobTitle: "x" }))).code).toBe("not-found");
  });

  it("is held by the database too: a client manager cannot change a role or another client's person, even with SQL", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    const other = await memberIdOf(rig.world().halden.id);
    expect(await captureErrorText(queryAs(clientDb(), asTenant(manager), "update member set role = 'manager'"))).toContain("permission denied for table member");
    await queryAs(clientDb(), asTenant(manager), `update member set phone = '+44 1' where id = '${other}'`);
    const [row] = await rig.dbs.owner.db.select({ phone: member.phone }).from(member).where(eq(member.id, other));
    expect(row?.phone).not.toBe("+44 1");
  });
});

describe("issueTenantInvite", () => {
  const CLIENT_PERSON = { email: "Colleague@Kestrel.example", name: "Colleen Ray", jobTitle: "Finance lead", phone: "+44 20 7946 0002" };

  it("lets a client manager invite into their own client: the invite, its email and the inviter are written, and the person can redeem it", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    const issued = await issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON });
    const [row] = await rig.dbs.owner.db.select().from(invite).where(eq(invite.id, issued.inviteId));
    expect(row).toMatchObject({ orgId: actor.orgId, orgKind: "client", email: "colleague@kestrel.example", name: "Colleen Ray", jobTitle: "Finance lead", phone: "+44 20 7946 0002", role: "member", alias: null, createdBy: actor.userId });
    expect(row?.expiresAt).toEqual(issued.expiresAt);
    const { link, token } = await latestInviteLink(rig, "colleague@kestrel.example");
    expect(link).toContain("/accept-invite?token=");
    const [mail] = await rig.dbs.owner.db.select().from(emailOutbox).where(eq(emailOutbox.inviteId, issued.inviteId));
    expect(mail).toMatchObject({ template: "invite", status: "pending", params: { name: "Colleen Ray", organisationName: "Kestrel Logistics Ltd" } });
    expect(mail?.body).not.toContain(token);
    const termsId = (await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client"))?.id ?? "";
    const redeemed = await redeemInvite(rig.deps(), { token, password: GOOD_PASSWORD, acceptedTermsId: termsId, address: "203.0.113.70" });
    expect(redeemed.status).toBe("redeemed");
    const created = await rig.dbs.owner.db.select({ jobTitle: member.jobTitle, phone: member.phone, displayName: member.displayName }).from(member).where(eq(member.displayName, "Colleen Ray"));
    expect(created).toEqual([{ jobTitle: "Finance lead", phone: "+44 20 7946 0002", displayName: "Colleen Ray" }]);
  });

  it("replaces the previous live invite of the same side and cancels its unsent email", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    const first = await issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON });
    const second = await issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON });
    const rows = await rig.dbs.owner.db.select({ id: invite.id, revokedAt: invite.revokedAt }).from(invite);
    expect(rows.find((row) => row.id === first.inviteId)?.revokedAt).not.toBeNull();
    expect(rows.find((row) => row.id === second.inviteId)?.revokedAt).toBeNull();
    const mails = await rig.dbs.owner.db.select({ inviteId: emailOutbox.inviteId, status: emailOutbox.status, link: emailOutbox.link }).from(emailOutbox);
    expect(mails.find((mail) => mail.inviteId === first.inviteId)).toMatchObject({ status: "cancelled", link: null });
    expect(mails.find((mail) => mail.inviteId === second.inviteId)?.status).toBe("pending");
  });

  it("refuses an ordinary person, another client, Fynix, an address that has an account, and an archived client", async () => {
    const ordinary = await ordinaryOf(rig.world().kestrel.id);
    expect((await refusal(issueTenantInvite(rig.deps(), clientDb(), ordinary, { organisationId: ordinary.orgId, ...CLIENT_PERSON }))).code).toBe("not-authorised");
    const actor = await managerOf(rig.world().kestrel.id);
    for (const organisationId of [rig.world().halden.id, rig.world().fynix.id, rig.world().brightpath.id]) {
      expect((await refusal(issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId, ...CLIENT_PERSON }))).code, organisationId).toBe("not-authorised");
    }
    const seededAddress = (await rig.dbs.owner.db.query.user.findFirst({ where: (table, { eq: same }) => same(table.id, actor.userId) }))?.email ?? "";
    expect((await refusal(issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON, email: seededAddress }))).code).toBe("email-in-use");
    await rig.dbs.owner.db.update(organisation).set({ status: "archived" }).where(eq(organisation.id, actor.orgId));
    expect((await refusal(issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON }))).code).toBe("organisation-archived");
    expect(await rig.dbs.owner.db.select({ id: invite.id }).from(invite)).toEqual([]);
  });

  it("refuses when the party has no terms, and placeholder terms where they are not allowed", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    await rig.dbs.owner.db.update(termsDocument).set({ placeholder: true }).where(eq(termsDocument.party, "client"));
    expect((await refusal(issueTenantInvite(rig.deps({ allowPlaceholderTerms: false }), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON }))).code).toBe("placeholder-terms");
    await issueTenantInvite(rig.deps({ allowPlaceholderTerms: true }), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON });
    await rig.dbs.owner.db.update(termsDocument).set({ status: "superseded" }).where(eq(termsDocument.party, "client"));
    expect((await refusal(issueTenantInvite(rig.deps(), clientDb(), actor, { organisationId: actor.orgId, ...CLIENT_PERSON, email: "other@kestrel.example" }))).code).toBe("no-current-terms");
  });

  it("lets a coordinator manager invite into its own organisation and into a partner agency, and a partner agency manager into its own only", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: coordinator.orgId, name: "Ridgeway Partner Media Ltd" });
    const own = await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: coordinator.orgId, email: "own@brightpath.example", name: "Own Person", ...JOB });
    const child = await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: partner.id, email: "child@ridgeway.example", name: "Child Person", ...JOB });
    const rows = await rig.dbs.owner.db.select({ id: invite.id, orgId: invite.orgId, alias: invite.alias, createdBy: invite.createdBy }).from(invite);
    expect(rows.find((row) => row.id === own.inviteId)).toMatchObject({ orgId: coordinator.orgId, alias: "Own Person", createdBy: coordinator.userId });
    expect(rows.find((row) => row.id === child.inviteId)).toMatchObject({ orgId: partner.id, alias: "Child Person" });
    // The coordinator may not invite into an agency that is not its own; the partner may not invite upwards or sideways.
    expect((await refusal(issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: rig.world().northgate.id, email: "x@northgate.example", name: "X Person", ...JOB }))).code).toBe("not-authorised");
    const partnerManager: TenantActor = { userId: coordinator.userId, orgId: partner.id, orgKind: "agency", role: "manager" };
    expect((await refusal(issueTenantInvite(rig.deps(), agencyDb(), partnerManager, { organisationId: coordinator.orgId, email: "y@brightpath.example", name: "Y Person", ...JOB }))).code).toBe("not-authorised");
  });

  it("does not let an agency manager revoke an invite that belongs to another organisation by inviting the same address", async () => {
    const fynixIssued = await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: "shared@example.com", name: "Shared Person", ...JOB });
    const coordinator = await managerOf(rig.world().brightpath.id);
    expect((await refusal(issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: coordinator.orgId, email: "shared@example.com", name: "Shared Person", ...JOB }))).code).toBe("invite-conflict");
    const [row] = await rig.dbs.owner.db.select({ revokedAt: invite.revokedAt }).from(invite).where(eq(invite.id, fynixIssued.inviteId));
    expect(row?.revokedAt).toBeNull();
  });

  it("is held by the database: a tenant cannot write the invite table or the outbox directly", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    for (const statement of [
      "insert into invite (org_id, org_kind, email, name, token_hash, expires_at, created_by) values (gen_random_uuid(), 'client', 'a@b.example', 'x', 'x', now(), gen_random_uuid())",
      "insert into email_outbox (recipient, template, subject, body) values ('a@b.example', 'invite', 's', 'b')",
    ]) {
      expect(await captureErrorText(queryAs(clientDb(), asTenant(actor), statement)), statement).toContain("permission denied for table");
    }
  });
});

describe("a Fynix person invited into Fynix", () => {
  it("redeems into a Fynix membership with the invited role, job title and phone, after accepting the Fynix terms", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().fynix.id, email: "boss@fynix.example", name: "Boss Person", jobTitle: "Director", phone: "+44 20 7946 0003", role: "admin" });
    const { token } = await latestInviteLink(rig, "boss@fynix.example");
    const termsId = (await readCurrentTerms(rig.dbs.roles.leads_auth.db, "fynix"))?.id ?? "";
    const redeemed = await redeemInvite(rig.deps(), { token, password: GOOD_PASSWORD, acceptedTermsId: termsId, address: "203.0.113.71" });
    expect(redeemed).toMatchObject({ status: "redeemed", party: "fynix" });
    const [row] = await rig.dbs.owner.db.select({ orgKind: member.orgKind, role: member.role, jobTitle: member.jobTitle, phone: member.phone }).from(member).where(eq(member.displayName, "Boss Person"));
    expect(row).toEqual({ orgKind: "fynix", role: "manager", jobTitle: "Director", phone: "+44 20 7946 0003" });
  });
});

describe("who reads a client's profile", () => {
  const PROFILE = { introduction: "A family grocer", services: "Fresh produce", differentiator: "Picked the same day", caseStudies: "Cut waste" };

  /** A new client, Cedar, whose only campaign is with Northgate: Brightpath has no campaign for it. */
  async function cedar() {
    const created = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Cedar Grocers Ltd", profile: PROFILE });
    await addCollateral(rig.deps(), rig.actor, { clientOrgId: created.id, kind: "link", title: "Cedar brochure", url: "https://example.com/cedar.pdf" });
    const [first] = await rig.dbs.owner.db.select().from(campaign).where(eq(campaign.agencyOrgId, rig.world().northgate.id));
    if (first === undefined) throw new Error("no campaign");
    await rig.dbs.owner.db.insert(campaign).values({ ...first, id: randomUUID(), publicRef: "CMP-9C9C", name: "Cedar campaign", clientOrgId: created.id });
    return created;
  }
  const profilesSeenBy = async (db: Database, orgId: string): Promise<string[]> =>
    (await queryAs(db, { orgId, userId: rig.world().users[1]?.id ?? "" }, "select introduction from client_profile order by introduction")).map((row) => String(row.introduction));

  it("shows a client its own profile and nobody else's", async () => {
    const created = await cedar();
    expect(await profilesSeenBy(clientDb(), created.id)).toEqual([PROFILE.introduction]);
    expect(await profilesSeenBy(clientDb(), rig.world().halden.id)).not.toContain(PROFILE.introduction);
  });

  it("shows a coordinator the profiles of the clients of its own campaigns, and not Cedar's when it has no campaign for Cedar", async () => {
    const created = await cedar();
    const northgate = await profilesSeenBy(agencyDb(), rig.world().northgate.id);
    const brightpath = await profilesSeenBy(agencyDb(), rig.world().brightpath.id);
    expect(northgate).toContain(PROFILE.introduction);
    expect(brightpath).not.toContain(PROFILE.introduction);
    expect(brightpath).toHaveLength(2);
    expect(created.id).toBeDefined();
  });

  it("shows a partner agency the profile of a client only through a share, and hides removed collateral from everyone but Fynix", async () => {
    const created = await cedar();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: rig.world().northgate.id, name: "Cedar Partner Ltd" });
    expect(await profilesSeenBy(agencyDb(), partner.id)).toEqual([]);
    const [cedarCampaign] = await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign).where(eq(campaign.clientOrgId, created.id));
    if (cedarCampaign === undefined) throw new Error("no campaign");
    await rig.dbs.owner.db.insert(campaignShare).values({ campaignId: cedarCampaign.id, agencyOrgId: partner.id, monthlyShare: 5 });
    expect(await profilesSeenBy(agencyDb(), partner.id)).toEqual([PROFILE.introduction]);
    const [collateral] = await rig.dbs.owner.db.query.clientCollateral.findMany({ where: (table, { eq: same }) => same(table.clientOrgId, created.id) });
    await removeCollateral(rig.deps(), rig.actor, collateral?.id ?? "");
    for (const [db, orgId] of [[clientDb(), created.id], [agencyDb(), partner.id]] as const) {
      const titles = await queryAs(db, { orgId, userId: rig.world().users[1]?.id ?? "" }, "select title from client_collateral");
      expect(titles, orgId).toEqual([]);
    }
  });

  it("lets Fynix staff read and refuses them the write", async () => {
    const created = await cedar();
    expect((await refusal(updateClientProfile(rig.deps(), rig.staffActor, { clientOrgId: created.id, ...PROFILE }))).code).toBe("admin-required");
  });
});

describe("what an agency must never read or write", () => {
  const asAgency = (statement: string) => queryAs(agencyDb(), { orgId: rig.world().brightpath.id, userId: rig.world().users[3]?.id ?? "" }, statement);

  it("never sees a client person's job title, phone or email, through member or anything else", async () => {
    const clientPeople = rig.world().users.filter((person) => person.organisation.kind === "client");
    expect(clientPeople.length).toBeGreaterThan(0);
    const text = JSON.stringify([await asAgency("select display_name, job_title, phone from member"), await asAgency("select name from invite")]);
    for (const person of clientPeople) for (const secret of [person.jobTitle, person.phone, person.email, person.name]) expect(text).not.toContain(secret);
    expect(text).toContain(rig.world().users[3]?.jobTitle);
    for (const statement of ['select email from "user"', 'select m.phone, u.email from member m join "user" u on u.id = m.user_id']) {
      expect(await captureErrorText(asAgency(statement)), statement).toContain("permission denied for table user");
    }
    // The invite list is the agency's own side only: no address of a client person, whoever invited them.
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: "pending.client@kestrel.example", name: "Pending Client", jobTitle: "Buyer", phone: "+44 20 7946 0099" });
    const seen = JSON.stringify(await asAgency("select email, name, job_title, phone from invite"));
    for (const secret of ["pending.client@kestrel.example", "Pending Client", "Buyer", "+44 20 7946 0099", ...clientPeople.map((person) => person.email)]) expect(seen).not.toContain(secret);
  });

  it("cannot write a client profile, its collateral, a person's details or a time zone", async () => {
    const kestrel = rig.world().kestrel.id;
    for (const statement of [
      "update client_profile set services = 'x'",
      `insert into client_profile (client_org_id, services) values ('${kestrel}', 'x')`,
      `insert into client_collateral (client_org_id, kind, title, url) values ('${kestrel}', 'link', 'x', 'https://x.example')`,
      "update client_collateral set removed_at = now()",
      "update member set job_title = 'x', phone = 'x'",
      "update organisation set time_zone = 'UTC'",
    ]) {
      expect(await captureErrorText(asAgency(statement)), statement).toContain("permission denied for table");
    }
  });

  it("does not reveal a client's time zone, and the client reads only its own", async () => {
    expect(await captureErrorText(asAgency("select time_zone from organisation"))).toContain("permission denied for table organisation");
    const rows = await queryAs(clientDb(), { orgId: rig.world().kestrel.id, userId: rig.world().users[1]?.id ?? "" }, "select time_zone from organisation");
    expect(rows).toEqual([{ time_zone: "Africa/Nairobi" }]);
  });
});
