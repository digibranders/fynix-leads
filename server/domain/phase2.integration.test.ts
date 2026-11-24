import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreementAcceptance, campaign, campaignHost, campaignShare, hostBlock, hostHours, member, user } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { acceptAgreementByTenant } from "@/server/domain/agreements";
import { listAgreementVersions } from "@/server/domain/agreements-tenant";
import { readCampaignActivity } from "@/server/domain/campaign-activity";
import { closeCampaign, updateCampaign } from "@/server/domain/campaigns";
import { listCampaignReadiness, listTenantCampaigns, readCampaignBrief } from "@/server/domain/campaigns-tenant";
import { assignCampaignShare, unassignCampaignShare } from "@/server/domain/campaign-shares-tenant";
import { addClientHost, addOwnBlock, pauseClientHost, removeOwnBlock, setOwnHours } from "@/server/domain/hosts-tenant";
import { publishAgreement } from "@/server/domain/agreements";
import { addCampaignHost } from "@/server/domain/hosts";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { setCampaignShare } from "@/server/domain/shares";
import { agreeNumbers, auditRowsFor, firstCampaign, memberIdFor, refusal, setMemberRole, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 2 as the roles the app really runs (leads_client and leads_agency): the one agreement and who may read or accept it, the going-live
 * reason an agency is told, hosts managed by the client, a person's own hours, the client's brief, and the read-only rule for a closed campaign.
 * Every test that grants something also tries the other side, another client and another agency.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

let clientActor: TenantActor;
let supplierActor: TenantActor;
let otherClientActor: TenantActor;
let otherAgencyActor: TenantActor;
let campaignId: string;

const clientDb = () => rig.dbs.roles.leads_client.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;

/** A second, ordinary person at Kestrel, written as the owner. */
async function addKestrelPerson(name: string): Promise<{ readonly userId: string; readonly memberId: string }> {
  const [row] = await rig.dbs.owner.db.insert(user).values({ email: `${name.toLowerCase().replace(/\s+/g, ".")}@kestrel.example`, name }).returning({ id: user.id });
  if (row === undefined) throw new Error("No user was inserted");
  const [made] = await rig.dbs.owner.db.insert(member).values({ userId: row.id, orgId: rig.world().kestrel.id, orgKind: "client", role: "member", displayName: name }).returning({ id: member.id });
  if (made === undefined) throw new Error("No member was inserted");
  return { userId: row.id, memberId: made.id };
}

beforeEach(async () => {
  const world = await rig.reset();
  campaignId = firstCampaign(rig).id;
  const actor = (org: typeof world.kestrel, kind: "client" | "agency", role: "member" | "manager"): TenantActor => ({ userId: userIn(rig, org).id, orgId: org.id, orgKind: kind, role });
  clientActor = actor(world.kestrel, "client", "manager");
  supplierActor = actor(world.brightpath, "agency", "manager");
  otherClientActor = actor(world.halden, "client", "manager");
  otherAgencyActor = actor(world.northgate, "agency", "manager");
  for (const person of [clientActor, supplierActor, otherClientActor, otherAgencyActor]) await setMemberRole(rig, person.userId, "manager");
});

describe("the one agreement, accepted by both sides", () => {
  it("lets each manager accept for their own side, and the campaign takes the numbers when the second does", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 33, totalTarget: 198 });
    const [version] = await listAgreementVersions(clientDb(), clientActor, campaignId);
    if (version === undefined) throw new Error("no version");
    await acceptAgreementByTenant(clientDb(), rig.deps(), clientActor, { agreementId: version.id }, "203.0.113.1");
    expect((await rig.dbs.owner.db.select({ n: campaign.monthlyTarget }).from(campaign).where(eq(campaign.id, campaignId)))[0]?.n).not.toBe(33);
    await acceptAgreementByTenant(agencyDb(), rig.deps(), supplierActor, { agreementId: version.id }, "203.0.113.2");
    expect((await rig.dbs.owner.db.select({ n: campaign.monthlyTarget, t: campaign.totalTarget }).from(campaign).where(eq(campaign.id, campaignId)))[0]).toEqual({ n: 33, t: 198 });
    const rows = await rig.dbs.owner.db.select({ side: agreementAcceptance.side }).from(agreementAcceptance);
    expect(rows.map((row) => row.side).sort()).toEqual(["client", "supplier"]);
    // The campaign the tenants read now carries the one number.
    expect((await listTenantCampaigns(clientDb(), clientActor, "client")).find((row) => row.id === campaignId)?.monthlyTarget).toBe(33);
    expect((await listTenantCampaigns(agencyDb(), supplierActor, "supplier")).find((row) => row.id === campaignId)?.monthlyTarget).toBe(33);
  });

  it("refuses an ordinary member, the other client, the other coordinator and a partner agency of the coordinator", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 10, totalTarget: 60 });
    const [version] = await listAgreementVersions(clientDb(), clientActor, campaignId);
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: rig.world().brightpath.id, name: "Ridgeway Partner Ltd" });
    if (version === undefined) throw new Error("no version");
    const input = { agreementId: version.id };
    expect((await refusal(acceptAgreementByTenant(clientDb(), rig.deps(), { ...clientActor, role: "member" }, input, "x"))).code).toBe("not-authorised");
    // Another client and another coordinator do not even see the agreement.
    expect((await refusal(acceptAgreementByTenant(clientDb(), rig.deps(), otherClientActor, input, "x"))).code).toBe("not-found");
    expect((await refusal(acceptAgreementByTenant(agencyDb(), rig.deps(), otherAgencyActor, input, "x"))).code).toBe("not-found");
    // A partner agency never sees the agreement of a campaign it only shares.
    expect((await refusal(acceptAgreementByTenant(agencyDb(), rig.deps(), { userId: supplierActor.userId, orgId: partner.id, orgKind: "agency", role: "manager" }, input, "x"))).code).toBe("not-found");
    expect(await rig.dbs.owner.db.select().from(agreementAcceptance)).toEqual([]);
  });

  it("will not let a role accept for the other side, even straight into the table", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 10, totalTarget: 60 });
    const [version] = await listAgreementVersions(clientDb(), clientActor, campaignId);
    if (version === undefined) throw new Error("no version");
    const attempt = (db: typeof clientDb extends () => infer D ? D : never, actor: TenantActor, side: "client" | "supplier") =>
      withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => tx.insert(agreementAcceptance).values({ agreementId: version.id, userId: actor.userId, networkAddress: "x", side }));
    await expect(attempt(clientDb(), clientActor, "supplier")).rejects.toThrow();
    await expect(attempt(agencyDb(), supplierActor, "client")).rejects.toThrow();
    await expect(attempt(clientDb(), clientActor, "client")).resolves.toBeDefined();
  });

  it("shows each side its own acceptance by name and the other side's by time only, and no side reads the other's people", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 10, totalTarget: 60 });
    const [version] = await listAgreementVersions(clientDb(), clientActor, campaignId);
    if (version === undefined) throw new Error("no version");
    await acceptAgreementByTenant(clientDb(), rig.deps(), clientActor, { agreementId: version.id }, "203.0.113.1");
    await acceptAgreementByTenant(agencyDb(), rig.deps(), supplierActor, { agreementId: version.id }, "203.0.113.2");

    const forClient = await listAgreementVersions(clientDb(), clientActor, campaignId);
    const forSupplier = await listAgreementVersions(agencyDb(), supplierActor, campaignId);
    expect(forClient[0]).toMatchObject({ version: 1, status: "current", inForce: true, ownSide: { by: userIn(rig, rig.world().kestrel).name } });
    expect(forClient[0]?.otherSideAcceptedAt).toBeInstanceOf(Date);
    expect(forSupplier[0]).toMatchObject({ inForce: true, ownSide: { by: userIn(rig, rig.world().brightpath).name } });
    expect(JSON.stringify(forClient)).not.toContain(userIn(rig, rig.world().brightpath).name);
    expect(JSON.stringify(forClient)).not.toContain(userIn(rig, rig.world().brightpath).id);
    expect(JSON.stringify(forSupplier)).not.toContain(userIn(rig, rig.world().kestrel).name);
    expect(JSON.stringify(forSupplier)).not.toContain(userIn(rig, rig.world().kestrel).id);

    // Straight into the table: each role reads only its own side's rows.
    const seenByClient = await withTenantScope(clientDb(), { orgId: clientActor.orgId, userId: clientActor.userId }, (tx) => tx.select({ userId: agreementAcceptance.userId, side: agreementAcceptance.side }).from(agreementAcceptance));
    expect(seenByClient).toEqual([{ userId: clientActor.userId, side: "client" }]);
    const seenBySupplier = await withTenantScope(agencyDb(), { orgId: supplierActor.orgId, userId: supplierActor.userId }, (tx) => tx.select({ userId: agreementAcceptance.userId, side: agreementAcceptance.side }).from(agreementAcceptance));
    expect(seenBySupplier).toEqual([{ userId: supplierActor.userId, side: "supplier" }]);
    // Another client and another coordinator read nothing.
    expect(await withTenantScope(clientDb(), { orgId: otherClientActor.orgId, userId: otherClientActor.userId }, (tx) => tx.select({ id: agreementAcceptance.id }).from(agreementAcceptance))).toEqual([]);
    expect(await withTenantScope(agencyDb(), { orgId: otherAgencyActor.orgId, userId: otherAgencyActor.userId }, (tx) => tx.select({ id: agreementAcceptance.id }).from(agreementAcceptance))).toEqual([]);
  });

  it("lists every version, newest first, with the version in force and a waiting newer one; another client reads none", async () => {
    await agreeNumbers(rig, campaignId, { monthlyTarget: 10, totalTarget: 60 });
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 14, totalTarget: 84, rules: "Counted when held." });
    const versions = await listAgreementVersions(clientDb(), clientActor, campaignId);
    expect(versions.map((row) => [row.version, row.status, row.inForce, row.ownSide === null])).toEqual([
      [2, "current", false, true],
      [1, "superseded", true, false],
    ]);
    expect(versions[0]).toMatchObject({ monthlyTarget: 14, rules: "Counted when held." });
    expect(JSON.stringify(versions)).not.toContain("notes");
    expect((await refusal(listAgreementVersions(clientDb(), otherClientActor, campaignId))).code).toBe("not-found");
    expect((await refusal(listAgreementVersions(agencyDb(), otherAgencyActor, campaignId))).code).toBe("not-found");
  });

  it("refuses an acceptance on a closed campaign", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId, monthlyTarget: 10, totalTarget: 60 });
    const [version] = await listAgreementVersions(clientDb(), clientActor, campaignId);
    await closeCampaign(rig.deps(), rig.actor, campaignId);
    expect((await refusal(acceptAgreementByTenant(clientDb(), rig.deps(), clientActor, { agreementId: version?.id }, "x"))).code).toBe("campaign-closed");
  });
});

describe("why an agency's campaign is not live", () => {
  it("walks from no agreement, to no host, to waiting for Fynix, to live, to closed, and names nobody", async () => {
    const reason = async () => (await listCampaignReadiness(agencyDb(), supplierActor)).find((row) => row.campaignId === campaignId);
    expect(await reason()).toMatchObject({ bucket: "setting-up", notLiveReason: "Neither the client nor the coordinator has accepted the agreement yet." });
    await agreeNumbers(rig, campaignId);
    expect((await reason())?.notLiveReason).toBe("The campaign has no active host yet.");
    await addCampaignHost(rig.deps(), rig.actor, { campaignId, memberId: await memberIdFor(rig, clientActor.userId), jobTitle: "Head of Sales" });
    expect((await reason())?.notLiveReason).toBe("Fynix has not made it active yet.");
    await updateCampaign(rig.deps(), rig.actor, campaignId, { status: "active" });
    expect(await reason()).toMatchObject({ bucket: "active", notLiveReason: null });
    await closeCampaign(rig.deps(), rig.actor, campaignId);
    expect(await reason()).toMatchObject({ bucket: "closed", notLiveReason: "The campaign is closed." });
    expect(JSON.stringify(await listCampaignReadiness(agencyDb(), supplierActor))).not.toContain(rig.world().kestrel.name);
  });

  it("names the side that has accepted nothing, to a partner agency as to the coordinator, and shows each only its own campaigns", async () => {
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: rig.world().brightpath.id, name: "Ridgeway Partner Ltd" });
    await setCampaignShare(rig.deps(), rig.actor, { campaignId, agencyOrgId: partner.id, monthlyShare: 3 });
    const partnerActor: TenantActor = { userId: supplierActor.userId, orgId: partner.id, orgKind: "agency", role: "member" };
    const seen = await listCampaignReadiness(agencyDb(), partnerActor);
    expect(seen.map((row) => row.campaignId)).toEqual([campaignId]);
    expect(seen[0]?.notLiveReason).toBe("Neither the client nor the coordinator has accepted the agreement yet.");
    // Another coordinator sees none of Brightpath's campaigns, and a client may not ask at all.
    const others = await listCampaignReadiness(agencyDb(), otherAgencyActor);
    expect(others.map((row) => row.campaignId)).not.toContain(campaignId);
    expect((await refusal(listCampaignReadiness(clientDb(), clientActor))).code).toBe("not-authorised");
  });
});

describe("the client's brief of its own campaign", () => {
  it("reads the brief, never the internal notes, and not another client's campaign", async () => {
    await updateCampaign(rig.deps(), rig.actor, campaignId, { geography: "Benelux", icp: "Cold chain operators", jobTitles: ["Head of Operations"], instructions: "Lead with the case study", internalNotes: "INTERNAL margin is thin" });
    const brief = await readCampaignBrief(clientDb(), clientActor, campaignId);
    expect(brief).toMatchObject({ geography: "Benelux", icp: "Cold chain operators", jobTitles: ["Head of Operations"], instructions: "Lead with the case study" });
    expect(JSON.stringify(brief)).not.toContain("INTERNAL");
    expect(Object.keys(brief)).not.toContain("internalNotes");
    expect((await refusal(readCampaignBrief(clientDb(), otherClientActor, campaignId))).code).toBe("not-found");
    // The column stays closed to the client role itself.
    await expect(withTenantScope(clientDb(), { orgId: clientActor.orgId, userId: clientActor.userId }, (tx) => tx.select({ n: campaign.internalNotes }).from(campaign))).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(withTenantScope(clientDb(), { orgId: clientActor.orgId, userId: clientActor.userId }, (tx) => tx.select({ n: campaign.timeZone }).from(campaign))).rejects.toMatchObject({ cause: { code: "42501" } });
  });
});

describe("hosts, as the client", () => {
  it("lets a manager add a person of its own organisation as a host, change the title by adding again after a pause, and pause one", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    const added = await addClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId, jobTitle: "Head of Sales" });
    expect(added).toEqual({ campaignId, memberId: colleague.memberId, jobTitle: "Head of Sales", active: true });
    expect((await refusal(addClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId, jobTitle: "Again" }))).code).toBe("invalid-transition");
    expect(await pauseClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId })).toMatchObject({ active: false });
    expect((await refusal(pauseClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId }))).code).toBe("invalid-transition");
    expect(await addClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId, jobTitle: "VP Sales" })).toMatchObject({ jobTitle: "VP Sales", active: true });
    expect(await rig.dbs.owner.db.select().from(campaignHost).where(eq(campaignHost.campaignId, campaignId))).toHaveLength(1);
    expect((await auditRowsFor(rig, "campaign_host.add"))).toHaveLength(0);
  });

  it("refuses a person who is not a manager, someone from another organisation, another client's campaign, and an agency", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    const plain: TenantActor = { ...clientActor, role: "member" };
    // The seeded manager was promoted in the database; the domain trusts the actor it is handed, the database holds the line.
    expect((await refusal(addClientHost(clientDb(), plain, { campaignId, memberId: colleague.memberId, jobTitle: "x" }))).code).toBe("not-authorised");
    expect((await refusal(pauseClientHost(clientDb(), plain, { campaignId, memberId: colleague.memberId }))).code).toBe("not-authorised");
    const haldenPerson = await memberIdFor(rig, otherClientActor.userId);
    expect((await refusal(addClientHost(clientDb(), clientActor, { campaignId, memberId: haldenPerson, jobTitle: "x" }))).code).toBe("not-a-client-member");
    expect((await refusal(addClientHost(clientDb(), otherClientActor, { campaignId, memberId: haldenPerson, jobTitle: "x" }))).code).toBe("not-found");
    expect((await refusal(addClientHost(agencyDb(), supplierActor, { campaignId, memberId: colleague.memberId, jobTitle: "x" }))).code).toBe("not-authorised");
    // Straight at the table, a plain member and an agency are stopped by the database.
    const asPlainMember = { orgId: clientActor.orgId, userId: colleague.userId };
    await expect(
      withTenantScope(clientDb(), asPlainMember, (tx) => tx.insert(campaignHost).values({ campaignId, clientOrgId: clientActor.orgId, memberId: colleague.memberId, jobTitle: "Sneaky" })),
    ).rejects.toThrow();
    await expect(
      withTenantScope(agencyDb(), { orgId: supplierActor.orgId, userId: supplierActor.userId }, (tx) => tx.update(campaignHost).set({ active: false })),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await rig.dbs.owner.db.select().from(campaignHost)).toEqual([]);
  });

  it("refuses a closed campaign, and a suspended person", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, colleague.memberId));
    expect((await refusal(addClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId, jobTitle: "x" }))).code).toBe("not-a-client-member");
    const active = await addKestrelPerson("Sam Okoye");
    await addClientHost(clientDb(), clientActor, { campaignId, memberId: active.memberId, jobTitle: "Head of Sales" });
    await closeCampaign(rig.deps(), rig.actor, campaignId);
    expect((await refusal(pauseClientHost(clientDb(), clientActor, { campaignId, memberId: active.memberId }))).code).toBe("campaign-closed");
    expect((await refusal(addClientHost(clientDb(), clientActor, { campaignId, memberId: active.memberId, jobTitle: "x" }))).code).toBe("campaign-closed");
  });
});

describe("a host's own hours and blocked times", () => {
  const monday = { weekday: 1, startMinute: 540, endMinute: 1020 };

  it("lets any person set their own weekly hours and blocks, even when the campaign is closed", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    const plain: TenantActor = { userId: colleague.userId, orgId: clientActor.orgId, orgKind: "client", role: "member" };
    await addClientHost(clientDb(), clientActor, { campaignId, memberId: colleague.memberId, jobTitle: "Head of Sales" });
    await closeCampaign(rig.deps(), rig.actor, campaignId);
    expect(await setOwnHours(clientDb(), plain, { timeZone: "Europe/London", hours: [monday, { weekday: 3, startMinute: 600, endMinute: 900 }] })).toMatchObject({ memberId: colleague.memberId, hours: [monday, { weekday: 3, startMinute: 600, endMinute: 900 }] });
    expect(await setOwnHours(clientDb(), plain, { timeZone: "Asia/Kolkata", hours: [monday] })).toMatchObject({ timeZone: "Asia/Kolkata" });
    expect((await rig.dbs.owner.db.select().from(hostHours).where(eq(hostHours.memberId, colleague.memberId))).map((row) => [row.weekday, row.timeZone])).toEqual([[1, "Asia/Kolkata"]]);
    const soon = new Date(Date.now() + 86_400_000);
    const block = await addOwnBlock(clientDb(), plain, { startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 3_600_000).toISOString(), note: "Dentist" });
    expect(block).toMatchObject({ memberId: colleague.memberId, note: "Dentist" });
    await removeOwnBlock(clientDb(), plain, block.id);
    expect(await rig.dbs.owner.db.select().from(hostBlock)).toEqual([]);
  });

  it("refuses overlapping or malformed windows with the plain reason, and a block that ends before it starts", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    const plain: TenantActor = { userId: colleague.userId, orgId: clientActor.orgId, orgKind: "client", role: "member" };
    expect((await refusal(setOwnHours(clientDb(), plain, { timeZone: "Europe/London", hours: [monday, { weekday: 1, startMinute: 600, endMinute: 700 }] }))).code).toBe("invalid-input");
    expect((await refusal(setOwnHours(clientDb(), plain, { timeZone: "Not/AZone", hours: [] }))).code).toBe("invalid-input");
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    expect((await refusal(addOwnBlock(clientDb(), plain, { startsAt: soon, endsAt: soon }))).code).toBe("invalid-input");
  });

  it("never touches another person's hours or blocks: not a plain colleague, not the other client, not an agency", async () => {
    const colleague = await addKestrelPerson("Priya Rao");
    const stranger = await addKestrelPerson("Sam Okoye");
    const plainColleague: TenantActor = { userId: colleague.userId, orgId: clientActor.orgId, orgKind: "client", role: "member" };
    const plainStranger: TenantActor = { userId: stranger.userId, orgId: clientActor.orgId, orgKind: "client", role: "member" };
    await setOwnHours(clientDb(), plainColleague, { timeZone: "Europe/London", hours: [monday] });
    const soon = new Date(Date.now() + 86_400_000);
    const block = await addOwnBlock(clientDb(), plainColleague, { startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 3_600_000).toISOString() });

    // Through the domain: another person's block is simply not theirs.
    expect((await refusal(removeOwnBlock(clientDb(), plainStranger, block.id))).code).toBe("not-found");
    // Straight at the tables: a colleague who is not a manager can read it but cannot write or delete it.
    const asStranger = { orgId: clientActor.orgId, userId: stranger.userId };
    expect((await withTenantScope(clientDb(), asStranger, (tx) => tx.select({ id: hostHours.id }).from(hostHours))).length).toBe(1);
    expect(await withTenantScope(clientDb(), asStranger, (tx) => tx.delete(hostHours).where(eq(hostHours.memberId, colleague.memberId)).returning({ id: hostHours.id }))).toEqual([]);
    expect(await withTenantScope(clientDb(), asStranger, (tx) => tx.delete(hostBlock).where(eq(hostBlock.id, block.id)).returning({ id: hostBlock.id }))).toEqual([]);
    await expect(withTenantScope(clientDb(), asStranger, (tx) => tx.insert(hostHours).values({ memberId: colleague.memberId, timeZone: "Europe/London", weekday: 2, startMinute: 0, endMinute: 60 }))).rejects.toThrow();
    // A manager of the same client may.
    expect(await withTenantScope(clientDb(), { orgId: clientActor.orgId, userId: clientActor.userId }, (tx) => tx.delete(hostBlock).where(eq(hostBlock.id, block.id)).returning({ id: hostBlock.id }))).toHaveLength(1);
    // Another client reads and writes nothing of it; an agency has no write grant at all.
    const asOtherClient = { orgId: otherClientActor.orgId, userId: otherClientActor.userId };
    expect(await withTenantScope(clientDb(), asOtherClient, (tx) => tx.select({ id: hostHours.id }).from(hostHours))).toEqual([]);
    await expect(withTenantScope(clientDb(), asOtherClient, (tx) => tx.insert(hostHours).values({ memberId: colleague.memberId, timeZone: "Europe/London", weekday: 2, startMinute: 0, endMinute: 60 }))).rejects.toThrow();
    await expect(withTenantScope(agencyDb(), { orgId: supplierActor.orgId, userId: supplierActor.userId }, (tx) => tx.delete(hostHours))).rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await rig.dbs.owner.db.select().from(hostHours).where(and(eq(hostHours.memberId, colleague.memberId)))).toHaveLength(1);
  });

  it("is for clients only, and for an active person of the organisation", async () => {
    expect((await refusal(setOwnHours(agencyDb(), supplierActor, { timeZone: "Europe/London", hours: [] }))).code).toBe("not-authorised");
    const colleague = await addKestrelPerson("Priya Rao");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, colleague.memberId));
    expect((await refusal(setOwnHours(clientDb(), { userId: colleague.userId, orgId: clientActor.orgId, orgKind: "client", role: "member" }, { timeZone: "Europe/London", hours: [] }))).code).toBe("not-authorised");
  });
});

describe("a closed campaign is read only for the coordinator too", () => {
  it("refuses to assign, change and take back a share with campaign-closed, and leaves the share as it was", async () => {
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: rig.world().brightpath.id, name: "Ridgeway Partner Ltd" });
    await assignCampaignShare(agencyDb(), supplierActor, { campaignId, agencyOrgId: partner.id, monthlyShare: 4 });
    for (const status of ["paused", "completed", "archived"] as const) {
      await rig.dbs.owner.db.update(campaign).set({ status }).where(eq(campaign.id, campaignId));
      expect((await refusal(assignCampaignShare(agencyDb(), supplierActor, { campaignId, agencyOrgId: partner.id, monthlyShare: 9 }))).code, status).toBe("campaign-closed");
      expect((await refusal(unassignCampaignShare(agencyDb(), supplierActor, { campaignId, agencyOrgId: partner.id }))).code, status).toBe("campaign-closed");
    }
    expect((await rig.dbs.owner.db.select({ n: campaignShare.monthlyShare }).from(campaignShare).where(eq(campaignShare.agencyOrgId, partner.id)))[0]?.n).toBe(4);
  });
});

describe("the activity of a campaign", () => {
  it("lists what Fynix changed on it and on its agreement, shares and hosts, newest first, and nothing of another campaign", async () => {
    const other = rig.world().campaigns[1];
    if (other === undefined) throw new Error("no second campaign");
    await agreeNumbers(rig, campaignId);
    await addCampaignHost(rig.deps(), rig.actor, { campaignId, memberId: await memberIdFor(rig, clientActor.userId), jobTitle: "Head of Sales" });
    await setCampaignShare(rig.deps(), rig.actor, { campaignId, agencyOrgId: rig.world().brightpath.id, monthlyShare: 4 });
    await updateCampaign(rig.deps(), rig.actor, campaignId, { status: "active" });
    await closeCampaign(rig.deps(), rig.actor, campaignId, "Done");
    await publishAgreement(rig.deps(), rig.actor, { campaignId: other.id, monthlyTarget: 5, totalTarget: 30 });

    const rows = await readCampaignActivity(rig.deps(), rig.staffActor, campaignId);
    const actions = rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["agreement.publish", "agreement.accept", "campaign_host.add", "campaign_share.set", "campaign.update", "campaign.close"]));
    expect(actions[0]).toBe("campaign.close");
    expect(rows.every((row) => row.source === "audit")).toBe(true);
    expect(rows.filter((row) => row.action === "agreement.publish")).toHaveLength(1);
    expect(rows.map((row) => row.at.getTime())).toEqual([...rows.map((row) => row.at.getTime())].sort((a, b) => b - a));
    expect((await refusal(readCampaignActivity(rig.deps(), rig.staffActor, "99999999-9999-4999-8999-999999999999"))).code).toBe("not-found");
  });
});
