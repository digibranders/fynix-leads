import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aliasIdentity, campaign, campaignShare, lead, member, user } from "@/server/db/schema";
import { listAgencyRows, readAgencyDetail } from "@/server/domain/agency-overview";
import { listFynixLeads } from "@/server/domain/lead-reads";
import { setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
import { readSetupFindings } from "@/server/domain/setup-overview";
import { createPartnerAgency } from "@/server/domain/suppliers";
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

/** A partner agency under Brightpath with a manager and a share of Brightpath's campaign, and two leads it sent: one accepted this month, one still open. */
async function agencyWithLeads() {
  const world = rig.world();
  const owner = rig.dbs.owner.db;
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id);
  if (target === undefined) throw new Error("The seed has no campaign served by Brightpath");
  await owner.update(campaign).set({ timeZone: "UTC", status: "active" }).where(eq(campaign.id, target.id));
  const agency = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: world.brightpath.id, name: "Ridgeway Agency", contactEmail: "hello@ridgeway.example" });
  const [person] = await owner.insert(user).values({ email: "pia@ridgeway.example", name: "Pia Ridgeway" }).returning({ id: user.id });
  const [mine] = await owner.insert(member).values({ userId: person?.id ?? "", orgId: agency.id, orgKind: "agency", role: "manager", displayName: "Pia Ridgeway" }).returning({ id: member.id });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: 3 });
  const [alias] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: "ALI-9R4T", memberId: mine?.id ?? "", clientOrgId: target.client.id, displayName: "Piet Ridge", jobTitle: "Partnerships", aliasEmail: "piet@ridgeway-brand.example", verifiedAt: new Date(), status: "active" })
    .returning({ id: aliasIdentity.id });
  const now = rig.clock.now;
  const base = {
    campaignId: target.id,
    sourceOrgId: agency.id,
    submittedByUserId: person?.id ?? "",
    aliasIdentityId: alias?.id ?? "",
    hostMemberId: mine?.id ?? "",
    prospectTitle: "Head of Finance",
    prospectCompany: "Orrin Foods",
    prospectDomain: "orrin.example",
    prospectLinkedinUrl: "https://www.linkedin.com/in/someone",
    bantBudget: "b",
    bantAuthority: "a",
    bantNeed: "n",
    bantTimeline: "t",
    submittedAt: now,
  };
  await owner.insert(lead).values({ ...base, publicRef: "LD-AAA1", prospectName: "Marta One", prospectEmail: "one@orrin.example", stage: "accepted", scheduledMeetingTime: now });
  await owner.insert(lead).values({ ...base, publicRef: "LD-AAA2", prospectName: "Marta Two", prospectEmail: "two@orrin.example", stage: "awaiting_client" });
  return { agency, target, world };
}

describe("listAgencyRows", () => {
  it("lists every partner agency with its coordinator, people, campaigns and this month's leads, and never a coordinator", async () => {
    const { agency, world } = await agencyWithLeads();
    const rows = await listAgencyRows(rig.deps(), rig.staffActor);
    expect(rows.map((row) => row.id)).toEqual([agency.id]);
    expect(rows[0]).toMatchObject({
      name: "Ridgeway Agency",
      contactEmail: "hello@ridgeway.example",
      status: "active",
      coordinator: { id: world.brightpath.id, name: world.brightpath.name },
      peopleCount: 1,
      campaignCount: 1,
      campaignCounts: { active: 1, setup: 0, closed: 0 },
      submittedThisMonth: 2,
      acceptedThisMonth: 1,
    });
  });

  it("includes archived agencies with their status", async () => {
    const { agency } = await agencyWithLeads();
    await setOrganisationStatus(rig.deps(), rig.actor, agency.id, "archived");
    expect((await listAgencyRows(rig.deps(), rig.staffActor))[0]?.status).toBe("archived");
  });
});

describe("readAgencyDetail", () => {
  it("carries the contact, coordinator, people, shares, campaigns with delivered, the tally and the activity", async () => {
    const { agency, target, world } = await agencyWithLeads();
    await updateOrganisation(rig.deps(), rig.actor, agency.id, { contactName: "Asha Rao", notes: "Internal note" });
    const detail = await readAgencyDetail(rig.deps(), rig.staffActor, agency.publicRef);
    expect(detail).toMatchObject({
      name: "Ridgeway Agency",
      contact: { contactName: "Asha Rao", contactEmail: "hello@ridgeway.example", notes: "Internal note" },
      coordinator: { publicRef: world.brightpath.publicRef },
      shares: { campaigns: 1, monthlyTotal: 3 },
      tally: { submittedThisMonth: 2, acceptedThisMonth: 1, delivered: 1 },
    });
    expect(detail.people.map((person) => person.name)).toEqual(["Pia Ridgeway"]);
    expect(detail.campaigns[0]).toMatchObject({ id: target.id, monthlyShare: 3, delivered: 1, clientName: target.client.name });
    expect(detail.activity.map((row) => row.action)).toEqual(expect.arrayContaining(["organisation.create", "organisation.update"]));
  });

  it("is not found for a coordinator, a client, an unknown reference and a malformed one", async () => {
    const { brightpath, kestrel } = rig.world();
    for (const ref of [brightpath.publicRef, kestrel.publicRef, "ORG-ZZZZ", "nope"]) await expect(readAgencyDetail(rig.deps(), rig.staffActor, ref)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("the Fynix leads read by source", () => {
  it("lists only the leads the agency sent, and drafts are not listed", async () => {
    const { agency, world } = await agencyWithLeads();
    const db = rig.dbs.roles.leads_fynix.db;
    expect((await listFynixLeads(db, rig.actor, { sourceOrgId: agency.id })).map((row) => row.publicRef).sort()).toEqual(["LD-AAA1", "LD-AAA2"]);
    expect(await listFynixLeads(db, rig.actor, { sourceOrgId: world.brightpath.id })).toEqual([]);
    expect(await listFynixLeads(db, rig.actor)).toHaveLength(2);
  });
});

describe("the set-up findings", () => {
  it("name an active partner agency with no manager", async () => {
    const { brightpath } = rig.world();
    const agency = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Unmanaged Agency" });
    expect((await readSetupFindings(rig.deps(), rig.staffActor)).agenciesWithoutManager).toEqual([{ name: "Unmanaged Agency", ref: agency.publicRef }]);
  });
});
