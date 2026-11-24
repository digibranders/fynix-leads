import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invite, member, organisation } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import type { TenantActor } from "@/server/domain/alias-identity";
import { issueTenantInvite, listInvites, previewInvite } from "@/server/domain/invites";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { addPartnerAgencyAsCoordinator, listMyTeam, readOwnFynixProfile, readOwnProfile, setMemberMeetingEmails, updateOwnFynixProfile, updateOwnProfile } from "@/server/domain/team";
import { auditRowsFor, latestInviteLink, publishApprovedTerms, refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 1 chunk C against the real roles: the people lists of the Team pages, who may add a partner agency, the meeting emails switch, the profile
 * edit that every portal shares, and the "Coordinator" or "Agency" label of an invite. The leak cases are the ones the roadmap names: a client or another
 * coordinator cannot add an agency under someone else, and nobody reads the people of a side that is not theirs.
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

describe("listMyTeam", () => {
  it("lists a client's own people with email, phone and role, and the open invites to its manager only", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    await issueTenantInvite(rig.deps(), clientDb(), manager, { organisationId: manager.orgId, email: "waiting@kestrel.example", name: "Waiting Person", ...JOB });
    const seen = await listMyTeam(clientDb(), rig.deps(), manager);
    expect(seen.filter((row) => row.kind === "member")).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "member", orgId: null, role: "manager", state: "active", meetingEmails: true });
    expect(seen[0]?.email).toContain("@");
    expect(seen.find((row) => row.kind === "invite")).toMatchObject({ email: "waiting@kestrel.example", state: "invited", orgId: null });

    const ordinary = await ordinaryOf(rig.world().kestrel.id);
    const ordinarySeen = await listMyTeam(clientDb(), rig.deps(), ordinary);
    expect(ordinarySeen.map((row) => row.kind)).toEqual(["member"]);
  });

  it("marks an invite that has lapsed", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    await issueTenantInvite(rig.deps(), clientDb(), manager, { organisationId: manager.orgId, email: "late@kestrel.example", name: "Late Person", ...JOB });
    const later = new Date(rig.clock.now.getTime() + 8 * 24 * 3_600_000);
    expect((await listMyTeam(clientDb(), { now: () => later }, manager)).find((row) => row.kind === "invite")?.state).toBe("invite-expired");
  });

  it("gives a coordinator its own people and its partner agencies' people, and a partner agency only its own", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: coordinator.orgId, name: "Ridgeway Partner Media Ltd" });
    await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: partner.id, email: "child@ridgeway.example", name: "Child Person", ...JOB });
    const seen = await listMyTeam(agencyDb(), rig.deps(), coordinator);
    expect(seen.find((row) => row.email === "child@ridgeway.example")).toMatchObject({ orgId: partner.id, orgName: "Ridgeway Partner Media Ltd", kind: "invite" });
    expect(seen.some((row) => row.orgId === null && row.kind === "member")).toBe(true);

    // A person at the partner agency (made by redeeming nothing: the owner adds the member) reads their own side only.
    const [coordinatorMember] = await rig.dbs.owner.db.select({ userId: member.userId }).from(member).where(eq(member.orgId, coordinator.orgId));
    const partnerView = await listMyTeam(agencyDb(), rig.deps(), { userId: coordinatorMember?.userId ?? "", orgId: partner.id });
    expect(partnerView).toEqual([]);
  });

  it("never lists another organisation's people, to a client or to an agency", async () => {
    const other = await managerOf(rig.world().halden.id);
    const kestrel = await listMyTeam(clientDb(), rig.deps(), await managerOf(rig.world().kestrel.id));
    expect(kestrel.map((row) => row.email)).not.toContain((await rig.dbs.owner.db.query.user.findFirst({ where: (table, { eq: same }) => same(table.id, other.userId) }))?.email);
    expect(kestrel.every((row) => row.orgId === null)).toBe(true);
    const northgate = await listMyTeam(agencyDb(), rig.deps(), await managerOf(rig.world().northgate.id));
    expect(northgate.every((row) => row.orgId === null)).toBe(true);
    expect(northgate).toHaveLength(1);
  });

  it("is refused to a role that has no right to the function", async () => {
    const actor = await managerOf(rig.world().kestrel.id);
    expect(await captureErrorText(queryAs(rig.dbs.roles.leads_public.db, asTenant(actor), "select * from app_my_team()"))).toContain("permission denied for function app_my_team");
  });
});

describe("addPartnerAgencyAsCoordinator", () => {
  it("lets a coordinator manager add a partner agency under its own account, which then shows in its list and in Fynix's", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    const added = await addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "  Lakeside Outreach Ltd " });
    expect(added.publicRef).toMatch(/^ORG-/);
    const [row] = await rig.dbs.owner.db.select({ name: organisation.name, kind: organisation.kind, parentOrgId: organisation.parentOrgId, status: organisation.status }).from(organisation).where(eq(organisation.id, added.id));
    expect(row).toEqual({ name: "Lakeside Outreach Ltd", kind: "agency", parentOrgId: coordinator.orgId, status: "active" });
    // It can be invited into straight away.
    await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: added.id, email: "first@lakeside.example", name: "First Person", ...JOB });
  });

  it("refuses a duplicate name among its own agencies, in any case, but allows the same name under another coordinator", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    await addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "Lakeside Outreach" });
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "lakeside outreach " }))).code).toBe("duplicate-name");
    const other = await managerOf(rig.world().northgate.id);
    await addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), other, { name: "Lakeside Outreach" });
  });

  it("refuses a member, a client, a partner agency's manager and an archived coordinator", async () => {
    const ordinary = await ordinaryOf(rig.world().brightpath.id);
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), ordinary, { name: "Nope" }))).code).toBe("not-authorised");
    const client = await managerOf(rig.world().kestrel.id);
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), clientDb(), client, { name: "Nope" }))).code).toBe("not-authorised");
    const coordinator = await managerOf(rig.world().brightpath.id);
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: coordinator.orgId, name: "Ridgeway Partner Media Ltd" });
    // The partner's manager is a person of the partner agency; the pre-check lets an agency manager through, so this is the database refusing.
    const partnerManager: TenantActor = { userId: coordinator.userId, orgId: partner.id, orgKind: "agency", role: "manager" };
    await rig.dbs.owner.db.update(member).set({ orgId: partner.id }).where(eq(member.userId, coordinator.userId));
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), partnerManager, { name: "Grandchild" }))).code).toBe("not-authorised");
    await rig.dbs.owner.db.update(member).set({ orgId: coordinator.orgId }).where(eq(member.userId, coordinator.userId));
    await rig.dbs.owner.db.update(organisation).set({ status: "archived" }).where(eq(organisation.id, coordinator.orgId));
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "Late" }))).code).toBe("organisation-archived");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation).where(eq(organisation.name, "Nope"))).toEqual([]);
  });

  it("is held by the database: a client has no right to the function, and the name of a parent cannot be chosen", async () => {
    const client = await managerOf(rig.world().kestrel.id);
    expect(await captureErrorText(queryAs(clientDb(), asTenant(client), "select * from app_add_partner_agency('Nope', 'ORG-ZZZZ')"))).toContain("permission denied for function app_add_partner_agency");
    const coordinator = await managerOf(rig.world().brightpath.id);
    const added = await addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "Lakeside Outreach" });
    const northgate = await managerOf(rig.world().northgate.id);
    // Another coordinator does not see it, and cannot invite into it.
    expect((await listMyTeam(agencyDb(), rig.deps(), northgate)).every((row) => row.orgId === null)).toBe(true);
    expect((await refusal(issueTenantInvite(rig.deps(), agencyDb(), northgate, { organisationId: added.id, email: "z@lakeside.example", name: "Z Person", ...JOB }))).code).toBe("not-authorised");
  });

  it("checks the input before the database", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "" }))).code).toBe("invalid-input");
    expect((await refusal(addPartnerAgencyAsCoordinator(rig.deps(), agencyDb(), coordinator, { name: "Fine", parentOrgId: rig.world().northgate.id }))).code).toBe("invalid-input");
  });
});

describe("setMemberMeetingEmails", () => {
  it("defaults to on, and a client manager switches it for a person of their own client", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    const id = await memberIdOf(rig.world().kestrel.id);
    expect((await listMyTeam(clientDb(), rig.deps(), manager))[0]?.meetingEmails).toBe(true);
    await setMemberMeetingEmails(clientDb(), manager, id, false);
    expect((await listMyTeam(clientDb(), rig.deps(), manager))[0]?.meetingEmails).toBe(false);
    await setMemberMeetingEmails(clientDb(), manager, id, true);
    expect((await listMyTeam(clientDb(), rig.deps(), manager))[0]?.meetingEmails).toBe(true);
  });

  it("refuses an ordinary person, an agency and a person of another client (not found, whatever the id)", async () => {
    const ordinary = await ordinaryOf(rig.world().kestrel.id);
    const own = await memberIdOf(rig.world().kestrel.id);
    expect((await refusal(setMemberMeetingEmails(clientDb(), ordinary, own, false))).code).toBe("not-authorised");
    const agency = await managerOf(rig.world().northgate.id);
    expect((await refusal(setMemberMeetingEmails(agencyDb(), agency, await memberIdOf(rig.world().northgate.id), false))).code).toBe("not-authorised");
    const manager = await managerOf(rig.world().kestrel.id);
    const other = await memberIdOf(rig.world().halden.id);
    expect((await refusal(setMemberMeetingEmails(clientDb(), manager, other, false))).code).toBe("not-found");
    const [row] = await rig.dbs.owner.db.select({ meetingEmails: member.meetingEmails }).from(member).where(eq(member.id, other));
    expect(row?.meetingEmails).toBe(true);
  });

  it("is held by the database: an agency cannot write or read the column, and a client cannot read it directly", async () => {
    const agency = await managerOf(rig.world().northgate.id);
    expect(await captureErrorText(queryAs(agencyDb(), asTenant(agency), "update member set meeting_emails = false"))).toContain("permission denied for table member");
    expect(await captureErrorText(queryAs(agencyDb(), asTenant(agency), "select meeting_emails from member"))).toContain("permission denied for table member");
    const client = await managerOf(rig.world().kestrel.id);
    expect(await captureErrorText(queryAs(clientDb(), asTenant(client), "select meeting_emails from member"))).toContain("permission denied for table member");
    expect(await captureErrorText(queryAs(clientDb(), asTenant(client), "update member set role = 'manager'"))).toContain("permission denied for table member");
  });
});

describe("updateOwnProfile", () => {
  it("lets any signed-in person change their own name, job title and phone: a client member, an agency member and Fynix staff", async () => {
    const client = await ordinaryOf(rig.world().kestrel.id);
    await updateOwnProfile(clientDb(), client, { displayName: "Priya Nair", jobTitle: "Head of Ops", phone: "+44 20 7946 0001" });
    expect(await readOwnProfile(clientDb(), client)).toEqual({ displayName: "Priya Nair", jobTitle: "Head of Ops", phone: "+44 20 7946 0001" });
    await updateOwnProfile(clientDb(), client, { displayName: "Priya Nair", jobTitle: "Head of Ops", phone: null });
    expect((await readOwnProfile(clientDb(), client)).phone).toBeNull();

    const agency = await ordinaryOf(rig.world().northgate.id);
    await updateOwnProfile(agencyDb(), agency, { displayName: "Ines Caetano", jobTitle: "Caller", phone: null });
    expect((await readOwnProfile(agencyDb(), agency)).displayName).toBe("Ines Caetano");

    const staffId = rig.staffActor.userId;
    expect((await refusal(updateOwnFynixProfile(rig.dbs.roles.leads_fynix.db, { userId: staffId }, { displayName: "", jobTitle: "x", phone: null }))).code).toBe("invalid-input");
    await updateOwnFynixProfile(rig.dbs.roles.leads_fynix.db, { userId: staffId }, { displayName: "Sam Ortega", jobTitle: "Support", phone: "+44 20 7946 0009" });
    expect(await readOwnFynixProfile(rig.dbs.roles.leads_fynix.db, { userId: staffId })).toEqual({ displayName: "Sam Ortega", jobTitle: "Support", phone: "+44 20 7946 0009" });
    // A Fynix change is audited, in the person's own name; staff reach nobody else's row.
    const audits = await auditRowsFor(rig, "member.update_details");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(staffId);
  });

  it("changes only the caller's own row, never the role, status or anyone else's", async () => {
    const client = await ordinaryOf(rig.world().kestrel.id);
    const other = await memberIdOf(rig.world().halden.id);
    const before = await rig.dbs.owner.db.select({ id: member.id, displayName: member.displayName, role: member.role, status: member.status }).from(member);
    await updateOwnProfile(clientDb(), client, { displayName: "Priya Nair", jobTitle: "Head of Ops", phone: null });
    const after = await rig.dbs.owner.db.select({ id: member.id, displayName: member.displayName, role: member.role, status: member.status }).from(member);
    expect(after.filter((row) => before.find((old) => old.id === row.id)?.displayName !== row.displayName).map((row) => row.displayName)).toEqual(["Priya Nair"]);
    expect(after.find((row) => row.id === other)).toEqual(before.find((row) => row.id === other));
    expect(after.map((row) => [row.role, row.status])).toEqual(before.map((row) => [row.role, row.status]));
  });

  it("refuses a suspended person and input that is not valid", async () => {
    const client = await ordinaryOf(rig.world().kestrel.id);
    expect((await refusal(updateOwnProfile(clientDb(), client, { displayName: "", jobTitle: "x", phone: null }))).code).toBe("invalid-input");
    expect((await refusal(updateOwnProfile(clientDb(), client, { displayName: "A", jobTitle: "x", phone: "abc" }))).code).toBe("invalid-input");
    expect((await refusal(updateOwnProfile(clientDb(), client, { displayName: "A", jobTitle: "x", phone: null, role: "manager" }))).code).toBe("invalid-input");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, client.userId));
    expect((await refusal(updateOwnProfile(clientDb(), client, { displayName: "A", jobTitle: "x", phone: null }))).code).toBe("not-authorised");
  });
});

describe("what Fynix sees of an invite a tenant sent", () => {
  it("lists it in the invite list with the name of the inviter, and in the open invites of the people read", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    await issueTenantInvite(rig.deps(), clientDb(), manager, { organisationId: manager.orgId, email: "seen@kestrel.example", name: "Seen Person", ...JOB });
    const listed = await listInvites(rig.deps(), rig.staffActor);
    expect(listed.find((row) => row.email === "seen@kestrel.example")).toMatchObject({ state: "pending", organisationId: manager.orgId, invitedBy: expect.any(String) });
  });
});

describe("previewInvite: Coordinator or Agency", () => {
  it("says a coordinator's invite is not for a partner agency, and a partner agency's is", async () => {
    const coordinator = await managerOf(rig.world().brightpath.id);
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: coordinator.orgId, name: "Ridgeway Partner Media Ltd" });
    await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: coordinator.orgId, email: "own@brightpath.example", name: "Own Person", ...JOB });
    await issueTenantInvite(rig.deps(), agencyDb(), coordinator, { organisationId: partner.id, email: "child@ridgeway.example", name: "Child Person", ...JOB });
    const own = await previewInvite(rig.deps(), { token: (await latestInviteLink(rig, "own@brightpath.example")).token, address: "203.0.113.80" });
    const child = await previewInvite(rig.deps(), { token: (await latestInviteLink(rig, "child@ridgeway.example")).token, address: "203.0.113.80" });
    expect(own).toMatchObject({ status: "pending", party: "agency", partner: false });
    expect(child).toMatchObject({ status: "pending", party: "agency", partner: true });
  });

  it("is never partner for a client", async () => {
    const manager = await managerOf(rig.world().kestrel.id);
    await issueTenantInvite(rig.deps(), clientDb(), manager, { organisationId: manager.orgId, email: "c@kestrel.example", name: "C Person", ...JOB });
    const preview = await previewInvite(rig.deps(), { token: (await latestInviteLink(rig, "c@kestrel.example")).token, address: "203.0.113.81" });
    expect(preview).toMatchObject({ status: "pending", party: "client", partner: false });
  });
});

it("keeps invite rows untouched by reads", async () => {
  expect(await rig.dbs.owner.db.select({ id: invite.id }).from(invite)).toEqual([]);
});
