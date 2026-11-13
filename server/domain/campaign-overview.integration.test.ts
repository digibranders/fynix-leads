import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { member, user } from "@/server/db/schema";
import { publishAgreement, recordAgreementAcceptance } from "@/server/domain/agreements";
import { addHostBlock, setHostHours } from "@/server/domain/availability";
import { listCampaignHosts, listCampaignRows, readAgreementsPage, readCampaignHeader } from "@/server/domain/campaign-overview";
import { updateCampaign } from "@/server/domain/campaigns";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { setCampaignShare } from "@/server/domain/shares";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { firstCampaign, memberIdFor, refusal, setMemberRole, userIn } from "@/server/domain/test-helpers";
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
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const campaignId = (): string => firstCampaign(rig).id;
const hostMember = () => memberIdFor(rig, userIn(rig, rig.world().kestrel).id);

/** A second active person at the first campaign's client, written as the owner. */
async function addClientPerson(name: string): Promise<string> {
  const [row] = await rig.dbs.owner.db.insert(user).values({ email: `${name.toLowerCase().replace(/\s+/g, ".")}@kestrel.example`, name }).returning({ id: user.id });
  if (row === undefined) throw new Error("No user was inserted");
  const [made] = await rig.dbs.owner.db.insert(member).values({ userId: row.id, orgId: rig.world().kestrel.id, orgKind: "client", role: "member", displayName: name }).returning({ id: member.id });
  if (made === undefined) throw new Error("No member was inserted");
  return made.id;
}

describe("listCampaignRows", () => {
  it("lists every campaign with its client and supplier names, and is open to Fynix staff", async () => {
    const rows = await listCampaignRows(rig.deps(), rig.staffActor);
    expect(rows).toHaveLength(4);
    const first = rows.find((row) => row.id === campaignId());
    expect(first).toMatchObject({ publicRef: firstCampaign(rig).publicRef, status: "draft", clientName: rig.world().kestrel.name, supplierName: rig.world().brightpath.name });
  });
});

describe("readCampaignHeader", () => {
  it("reads the header facts, the brief and the count of hosts that are switched on", async () => {
    await updateCampaign(rig.deps(), rig.actor, campaignId(), { status: "active", timeZone: "Asia/Kolkata", meetingMinutes: 45, geography: "United Kingdom", industries: ["Finance"], internalNotes: "Handle with care" });
    await addCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: await hostMember(), jobTitle: "Chief Operating Officer" });
    const other = await addClientPerson("Second Person");
    await addCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: other, jobTitle: "Head of Finance" });
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: other });

    const header = await readCampaignHeader(rig.deps(), rig.staffActor, firstCampaign(rig).publicRef);
    expect(header).toMatchObject({
      id: campaignId(),
      status: "active",
      clientName: rig.world().kestrel.name,
      supplierName: rig.world().brightpath.name,
      supplierOrgId: rig.world().brightpath.id,
      timeZone: "Asia/Kolkata",
      meetingMinutes: 45,
      activeHostCount: 1,
    });
    expect(header.brief).toMatchObject({ geography: "United Kingdom", industries: ["Finance"], internalNotes: "Handle with care", monthlyTarget: 20, totalTarget: 120, startDate: "2026-12-01" });
  });

  it("answers not-found for an unknown or malformed reference", async () => {
    for (const ref of ["CMP-ZZZZ", "nonsense", ""]) expect((await refusal(readCampaignHeader(rig.deps(), rig.actor, ref))).code, ref).toBe("not-found");
  });
});

describe("listCampaignHosts", () => {
  it("lists hosts by name with their weekly hours and blocks still to come, and offers the client's other active people", async () => {
    const hostId = await hostMember();
    const other = await addClientPerson("Alpha Person");
    await addCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: hostId, jobTitle: "Chief Operating Officer" });
    await setHostHours(rig.deps(), rig.actor, { memberId: hostId, timeZone: "Europe/London", hours: [{ weekday: 3, startMinute: 780, endMinute: 1020 }, { weekday: 1, startMinute: 540, endMinute: 1020 }] });
    const soon = new Date(rig.clock.now.getTime() + 86_400_000);
    await addHostBlock(rig.deps(), rig.actor, { memberId: hostId, startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 3_600_000).toISOString(), note: "Board meeting" });
    await addHostBlock(rig.deps(), rig.actor, { memberId: hostId, startsAt: new Date(rig.clock.now.getTime() - 7_200_000).toISOString(), endsAt: new Date(rig.clock.now.getTime() - 3_600_000).toISOString(), note: "Already over" });

    const { hosts, candidates } = await listCampaignHosts(rig.deps(), rig.staffActor, campaignId());
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({ memberId: hostId, jobTitle: "Chief Operating Officer", active: true, timeZone: "Europe/London" });
    expect(hosts[0]?.hours).toEqual([{ weekday: 1, startMinute: 540, endMinute: 1020 }, { weekday: 3, startMinute: 780, endMinute: 1020 }]);
    expect(hosts[0]?.blocks.map((block) => block.note)).toEqual(["Board meeting"]);
    expect(candidates).toEqual([{ memberId: other, displayName: "Alpha Person" }]);
  });

  it("keeps a switched off host in the list, with no hours when none are set, and offers them as a candidate again", async () => {
    const hostId = await hostMember();
    await addCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: hostId, jobTitle: "Chief Operating Officer" });
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: campaignId(), memberId: hostId });
    const { hosts, candidates } = await listCampaignHosts(rig.deps(), rig.actor, campaignId());
    expect(hosts).toEqual([{ memberId: hostId, displayName: userIn(rig, rig.world().kestrel).name, jobTitle: "Chief Operating Officer", active: false, timeZone: null, hours: [], blocks: [] }]);
    expect(candidates.map((row) => row.memberId)).toEqual([hostId]);
  });

  it("returns empty lists for a campaign without hosts and not-found for an unknown campaign, and never offers a suspended person", async () => {
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, await hostMember()));
    expect(await listCampaignHosts(rig.deps(), rig.actor, campaignId())).toEqual({ hosts: [], candidates: [] });
    expect((await refusal(listCampaignHosts(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
    expect((await refusal(listCampaignHosts(rig.deps(), rig.actor, "nope"))).code).toBe("invalid-input");
  });
});

describe("readAgreementsPage", () => {
  it("reads both agreements, who accepted the client's, the version it replaced, and the shares with who changed them", async () => {
    const { kestrel, brightpath } = rig.world();
    await setMemberRole(rig, userIn(rig, kestrel).id, "manager");
    await publishAgreement(rig.deps(), rig.actor, { campaignId: campaignId(), party: "client", monthlyTarget: 10, totalTarget: 60 });
    const second = await publishAgreement(rig.deps(), rig.actor, { campaignId: campaignId(), party: "client", monthlyTarget: 12, totalTarget: 72, rules: "Counted when held." });
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: userIn(rig, kestrel).id });
    await publishAgreement(rig.deps(), rig.actor, { campaignId: campaignId(), party: "supplier", monthlyTarget: 14, totalTarget: 84 });
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    await setCampaignShare(rig.deps(), rig.actor, { campaignId: campaignId(), agencyOrgId: brightpath.id, monthlyShare: 4 });
    await setCampaignShare(rig.deps(), rig.actor, { campaignId: campaignId(), agencyOrgId: partner.id, monthlyShare: 11 });

    const page = await readAgreementsPage(rig.deps(), rig.staffActor, campaignId());
    expect(page.client.current).toMatchObject({ version: 2, monthlyTarget: 12, totalTarget: 72, rules: "Counted when held.", accepted: [{ name: userIn(rig, kestrel).name }] });
    expect(page.client.previous).toMatchObject({ version: 1 });
    expect(page.client.previous?.supersededAt).toEqual(page.client.current?.createdAt);
    expect(page.supplier.current).toMatchObject({ version: 1, accepted: [] });
    expect(page.supplier.previous).toBeNull();
    expect(page.shares.map((row) => [row.agencyName, row.ownBookings, row.monthlyShare, row.changedBy])).toEqual([
      [brightpath.name, true, 4, "Person 1 of ORG-7F2A"],
      ["Ridgeway Partner Ltd", false, 11, "Person 1 of ORG-7F2A"],
    ]);
    expect(page.summary).toEqual({ totalShares: 15, supplierMonthlyTarget: 14, overAllocated: true });
    expect(page.options).toEqual([]);
  });

  it("offers the supplier and its partner agencies that have no share yet, and not an archived one or another supplier's", async () => {
    const { brightpath, northgate } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const retired = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Retired Partner Ltd" });
    await createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "Elsewhere Partner Ltd" });
    await setOrganisationStatus(rig.deps(), rig.actor, retired.id, "archived");
    const page = await readAgreementsPage(rig.deps(), rig.actor, campaignId());
    expect(page.options).toEqual([
      { id: brightpath.id, name: brightpath.name, ownBookings: true },
      { id: partner.id, name: "Ridgeway Partner Ltd", ownBookings: false },
    ]);
    expect(page.client).toEqual({ party: "client", current: null, previous: null });
    expect(page.summary).toEqual({ totalShares: 0, supplierMonthlyTarget: null, overAllocated: false });
  });

  it("answers not-found for an unknown campaign", async () => {
    expect((await refusal(readAgreementsPage(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
  });
});
