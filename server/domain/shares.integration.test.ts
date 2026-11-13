import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaignShare } from "@/server/db/schema";
import { publishAgreement } from "@/server/domain/agreements";
import { removeCampaignShare, listCampaignShares, setCampaignShare } from "@/server/domain/shares";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { auditRowsFor, firstCampaign, refusal } from "@/server/domain/test-helpers";
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
const partnerOf = (supplierId: string, name: string) => createPartnerAgency(rig.deps(), rig.actor, { supplierId, name });
const shareInput = (agencyOrgId: string, monthlyShare: number) => ({ campaignId: firstCampaign(rig).id, agencyOrgId, monthlyShare });
const stored = () => rig.dbs.owner.db.select().from(campaignShare).orderBy(asc(campaignShare.monthlyShare));
const publishSupplierTarget = (monthlyTarget: number) => publishAgreement(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, party: "supplier", monthlyTarget, totalTarget: monthlyTarget * 6 });

describe("setCampaignShare", () => {
  it("gives the supplier itself a share, reports there is no supplier target to compare with, and audits it", async () => {
    const { brightpath } = rig.world();
    const result = await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 5));
    expect(result.share).toEqual({ campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id, agencyRef: brightpath.publicRef, agencyName: brightpath.name, monthlyShare: 5 });
    expect(result.summary).toEqual({ totalShares: 5, supplierMonthlyTarget: null, overAllocated: false });
    const [audit] = await auditRowsFor(rig, "campaign_share.set");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "campaign_share", before: null, after: { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id, monthlyShare: 5 } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} ${brightpath.publicRef}`);
  });

  it("gives a partner agency of the supplier a share, and changes it when it is set again, keeping one row", async () => {
    const partner = await partnerOf(rig.world().brightpath.id, "Ridgeway Partner Ltd");
    await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5));
    const again = await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 8));
    expect(again.share.monthlyShare).toBe(8);
    expect(await stored()).toHaveLength(1);
    const audits = await auditRowsFor(rig, "campaign_share.set");
    expect(audits[1]).toMatchObject({ before: { monthlyShare: 5 }, after: { monthlyShare: 8 } });
  });

  it("flags a total above the supplier agreement's monthly target, and clears the flag when the total comes down; equal is not over", async () => {
    const { brightpath } = rig.world();
    const partner = await partnerOf(brightpath.id, "Ridgeway Partner Ltd");
    await publishSupplierTarget(10);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 6))).summary).toEqual({ totalShares: 6, supplierMonthlyTarget: 10, overAllocated: false });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 4))).summary).toMatchObject({ totalShares: 10, overAllocated: false });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5))).summary).toEqual({ totalShares: 11, supplierMonthlyTarget: 10, overAllocated: true });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 1))).summary.overAllocated).toBe(false);
  });

  it("compares with the supplier's agreement and ignores the client's, and follows a new version of it", async () => {
    const { brightpath } = rig.world();
    await publishAgreement(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, party: "client", monthlyTarget: 1000, totalTarget: 6000 });
    await publishSupplierTarget(10);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 12))).summary).toMatchObject({ supplierMonthlyTarget: 10, overAllocated: true });
    await publishSupplierTarget(15);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 12))).summary).toMatchObject({ supplierMonthlyTarget: 15, overAllocated: false });
  });

  it("refuses another supplier, a partner agency of another supplier, a client and an unknown agency, with the reason, and writes nothing", async () => {
    const { northgate, kestrel } = rig.world();
    const strangers = await partnerOf(northgate.id, "Northgate Partner Ltd");
    for (const agencyOrgId of [northgate.id, strangers.id]) {
      expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(agencyOrgId, 5)))).code, agencyOrgId).toBe("share-not-allowed");
    }
    for (const agencyOrgId of [kestrel.id, UNKNOWN]) {
      expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(agencyOrgId, 5)))).code, agencyOrgId).toBe("not-found");
    }
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig, "campaign_share.set")).toEqual([]);
  });

  it("refuses an archived partner agency, an unknown campaign, a negative or fractional share and a field it does not know", async () => {
    const partner = await partnerOf(rig.world().brightpath.id, "Ridgeway Partner Ltd");
    await setOrganisationStatus(rig.deps(), rig.actor, partner.id, "archived");
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5)))).code).toBe("organisation-archived");
    const { brightpath } = rig.world();
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, { ...shareInput(brightpath.id, 5), campaignId: UNKNOWN }))).code).toBe("not-found");
    for (const monthlyShare of [-1, 2.5]) expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, monthlyShare)))).code).toBe("invalid-input");
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, { ...shareInput(brightpath.id, 5), status: "x" }))).code).toBe("invalid-input");
    expect(await stored()).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(setCampaignShare(rig.deps(), rig.staffActor, shareInput(rig.world().brightpath.id, 5)))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
  });
});

describe("removeCampaignShare", () => {
  it("removes a share, returns the new summary and audits what was removed", async () => {
    const { brightpath } = rig.world();
    const partner = await partnerOf(brightpath.id, "Ridgeway Partner Ltd");
    await publishSupplierTarget(10);
    await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 8));
    await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 6));
    const summary = await removeCampaignShare(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, agencyOrgId: partner.id });
    expect(summary).toEqual({ totalShares: 8, supplierMonthlyTarget: 10, overAllocated: false });
    expect((await stored()).map((row) => row.monthlyShare)).toEqual([8]);
    const [audit] = await auditRowsFor(rig, "campaign_share.remove");
    expect(audit).toMatchObject({ subjectTable: "campaign_share", before: { agencyOrgId: partner.id, monthlyShare: 6 }, after: null });
  });

  it("refuses a share that does not exist and a malformed input, and is refused to Fynix staff", async () => {
    const { brightpath } = rig.world();
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id }))).code).toBe("not-found");
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: UNKNOWN, agencyOrgId: brightpath.id }))).code).toBe("not-found");
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: "x", agencyOrgId: brightpath.id }))).code).toBe("invalid-input");
    await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 5));
    expect((await refusal(removeCampaignShare(rig.deps(), rig.staffActor, { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id }))).code).toBe("admin-required");
    expect(await stored()).toHaveLength(1);
  });
});

describe("listCampaignShares", () => {
  it("lists the shares by agency name with the summary, and is open to Fynix staff", async () => {
    const { brightpath } = rig.world();
    const zed = await partnerOf(brightpath.id, "Zed Partner Ltd");
    const alpha = await partnerOf(brightpath.id, "Alpha Partner Ltd");
    await publishSupplierTarget(10);
    await setCampaignShare(rig.deps(), rig.actor, shareInput(zed.id, 7));
    await setCampaignShare(rig.deps(), rig.actor, shareInput(alpha.id, 5));
    const listed = await listCampaignShares(rig.deps(), rig.staffActor, firstCampaign(rig).id);
    expect(listed.shares.map((row) => [row.agencyName, row.monthlyShare])).toEqual([
      ["Alpha Partner Ltd", 5],
      ["Zed Partner Ltd", 7],
    ]);
    expect(listed.summary).toEqual({ totalShares: 12, supplierMonthlyTarget: 10, overAllocated: true });
  });

  it("returns an empty list for a campaign with no shares, and refuses an unknown campaign", async () => {
    expect(await listCampaignShares(rig.deps(), rig.actor, firstCampaign(rig).id)).toEqual({ shares: [], summary: { totalShares: 0, supplierMonthlyTarget: null, overAllocated: false } });
    expect((await refusal(listCampaignShares(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
  });
});
