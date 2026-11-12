import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign } from "@/server/db/schema";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation, setOrganisationStatus } from "@/server/domain/organisations";
import { auditRowsFor, scriptedBytes } from "@/server/domain/test-helpers";
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

const refusal = async (work: Promise<unknown>): Promise<DomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const input = () => ({ clientOrgId: rig.world().kestrel.id, agencyOrgId: rig.world().northgate.id, name: "Benelux cold chain", startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 12, totalTarget: 72 });
const row = async (id: string) => (await rig.dbs.owner.db.select().from(campaign).where(eq(campaign.id, id)))[0];

describe("createCampaign", () => {
  it("creates a draft with a generated reference, the client's brand copied, every requirement field stored, and audits it", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, {
      ...input(),
      geography: "Benelux",
      industries: ["Logistics", "Food"],
      companySize: "100 to 1000",
      icp: "Cold chain operators",
      jobTitles: ["Head of Operations"],
      seniority: "Director and above",
      technologies: ["SAP", "Manhattan"],
      bantBudget: "Over 50k",
      bantAuthority: "Signs contracts",
      bantNeed: "Replacing a TMS",
      bantTimeline: "This year",
      instructions: "Lead with the cold chain case study.",
      internalNotes: "INTERNAL margin is thin",
    });
    expect(created).toMatchObject({ name: "Benelux cold chain", status: "draft" });
    expect(created.publicRef).toMatch(/^CMP-[0-9A-HJKMNP-TV-Z]{4}$/);
    const stored = await row(created.id);
    expect(stored).toMatchObject({ clientBrandName: "Kestrel", industries: ["Logistics", "Food"], technologies: ["SAP", "Manhattan"], jobTitles: ["Head of Operations"], bantNeed: "Replacing a TMS", internalNotes: "INTERNAL margin is thin" });
    const [audit] = await auditRowsFor(rig, "campaign.create");
    expect(audit).toMatchObject({ subjectTable: "campaign", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { ref: created.publicRef, status: "draft", geography: "Benelux", internalNotes: "INTERNAL margin is thin" } });
  });

  it("leaves the optional requirement fields empty when they are not given", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, input());
    expect(await row(created.id)).toMatchObject({ geography: "", industries: [], icp: "", technologies: [], bantBudget: "", instructions: "", internalNotes: null });
  });

  it("tries another reference when the first is taken, and still audits the change", async () => {
    // CMP-7Q2X is the seeded campaign: [7, 23, 2, 29] in the reference alphabet.
    const created = await createCampaign(rig.deps({ randomBytes: scriptedBytes([[7, 23, 2, 29], [1, 2, 3, 5]]) }), rig.actor, input());
    expect(created.publicRef).toBe("CMP-1235");
    expect(await auditRowsFor(rig, "campaign.create")).toHaveLength(1);
  });

  it.each([
    ["an agency as the client", (): Record<string, unknown> => ({ ...input(), clientOrgId: rig.world().brightpath.id }), "not-found"],
    ["a client as the agency", (): Record<string, unknown> => ({ ...input(), agencyOrgId: rig.world().kestrel.id }), "not-found"],
    ["an organisation that does not exist", (): Record<string, unknown> => ({ ...input(), clientOrgId: "99999999-9999-4999-8999-999999999999" }), "not-found"],
    ["an end date before the start date", (): Record<string, unknown> => ({ ...input(), endDate: "2026-12-31" }), "invalid-input"],
    ["a status", (): Record<string, unknown> => ({ ...input(), status: "active" }), "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, make, code) => {
    expect((await refusal(createCampaign(rig.deps(), rig.actor, make()))).code).toBe(code);
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(4);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("refuses an archived client or agency", async () => {
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "archived");
    expect((await refusal(createCampaign(rig.deps(), rig.actor, input()))).code).toBe("organisation-archived");
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "active");
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().northgate.id, "archived");
    expect((await refusal(createCampaign(rig.deps(), rig.actor, input()))).code).toBe("organisation-archived");
  });

  it("works for an organisation created through the service", async () => {
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Orchard Foods Ltd", brandName: "Orchard" });
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), clientOrgId: client.id });
    expect(await row(created.id)).toMatchObject({ clientBrandName: "Orchard" });
  });
});

describe("updateCampaign", () => {
  it("changes details and audits the before and after, with the internal notes in both", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), internalNotes: "first" });
    const after = await updateCampaign(rig.deps(), rig.actor, created.id, { name: "Benelux cold chain, phase two", monthlyTarget: 15, internalNotes: "second", industries: ["Food"] });
    expect(after.name).toBe("Benelux cold chain, phase two");
    const [audit] = await auditRowsFor(rig, "campaign.update");
    expect(audit).toMatchObject({ subjectRef: created.publicRef, before: { name: "Benelux cold chain", monthlyTarget: 12, internalNotes: "first", industries: [] }, after: { name: "Benelux cold chain, phase two", monthlyTarget: 15, internalNotes: "second", industries: ["Food"] } });
  });

  it("moves through the lifecycle, and archives and restores with their own audit actions", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    for (const status of ["active", "paused", "active", "completed", "archived", "draft"] as const) {
      expect(await updateCampaign(rig.deps(), rig.actor, id, { status })).toMatchObject({ status });
    }
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["campaign.create", "campaign.update", "campaign.update", "campaign.update", "campaign.update", "campaign.archive", "campaign.restore"]);
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(5);
  });

  it("refuses a move the lifecycle does not allow, an end date before the start date, a change of client and an unknown id, and changes nothing", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { status: "completed" }))).code).toBe("invalid-transition");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { endDate: "2026-12-31" }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { clientOrgId: rig.world().halden.id }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", { name: "x" }))).code).toBe("not-found");
    expect(await row(id)).toMatchObject({ status: "draft", clientOrgId: rig.world().kestrel.id });
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["campaign.create"]);
  });
});
