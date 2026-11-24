import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign } from "@/server/db/schema";
import { closeCampaign, createCampaign, reopenCampaign, updateCampaign } from "@/server/domain/campaigns";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import { publishAgreement, recordAgreementAcceptance } from "@/server/domain/agreements";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation, setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { auditRowsFor, makeCampaignReady, memberIdFor, scriptedBytes, setMemberRole, userIn } from "@/server/domain/test-helpers";
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
    await makeCampaignReady(rig, id);
    for (const status of ["active", "paused", "active", "completed", "archived", "draft"] as const) {
      expect(await updateCampaign(rig.deps(), rig.actor, id, { status })).toMatchObject({ status });
    }
    expect((await auditRowsFor(rig)).map((row) => row.action).filter((action) => action.startsWith("campaign."))).toEqual(["campaign.create", "campaign.update", "campaign.update", "campaign.update", "campaign.update", "campaign.archive", "campaign.restore"]);
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(5);
  });

  it("refuses a move the lifecycle does not allow, an end date before the start date, a change of client and an unknown id, and changes nothing", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { status: "paused" }))).code).toBe("invalid-transition");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { endDate: "2026-12-31" }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { clientOrgId: rig.world().halden.id }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", { name: "x" }))).code).toBe("not-found");
    expect(await row(id)).toMatchObject({ status: "draft", clientOrgId: rig.world().kestrel.id });
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["campaign.create"]);
  });
});

describe("the going-live rule", () => {
  const create = async () => (await createCampaign(rig.deps(), rig.actor, input())).id;
  const clientUser = () => userIn(rig, rig.world().kestrel);
  const supplierUser = () => userIn(rig, rig.world().northgate);
  const goLive = (id: string) => updateCampaign(rig.deps(), rig.actor, id, { status: "active" });

  it("refuses with no agreement, naming both sides, and with no host after the agreement", async () => {
    const id = await create();
    const first = await refusal(goLive(id));
    expect(first).toMatchObject({ code: "agreement-not-accepted", message: "Neither the client nor the coordinator has accepted the agreement yet." });
    await setMemberRole(rig, clientUser().id, "manager");
    await setMemberRole(rig, supplierUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, { campaignId: id, monthlyTarget: 12, totalTarget: 72 });
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: clientUser().id });
    expect(await refusal(goLive(id))).toMatchObject({ code: "agreement-not-accepted", message: "The coordinator has not accepted the agreement yet." });
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: supplierUser().id });
    expect((await refusal(goLive(id))).code).toBe("no-host");
    expect(await row(id)).toMatchObject({ status: "draft" });
    await addCampaignHost(rig.deps(), rig.actor, { campaignId: id, memberId: await memberIdFor(rig, clientUser().id), jobTitle: "Head of Sales" });
    expect(await goLive(id)).toMatchObject({ status: "active" });
  });

  it("names the client when only the coordinator has accepted", async () => {
    const id = await create();
    await setMemberRole(rig, supplierUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, { campaignId: id, monthlyTarget: 12, totalTarget: 72 });
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: supplierUser().id });
    expect((await refusal(goLive(id))).message).toBe("The client has not accepted the agreement yet.");
  });

  it("applies to a resume from paused too, and a paused host with no other counts as no host", async () => {
    const id = await create();
    await makeCampaignReady(rig, id);
    await goLive(id);
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: id, memberId: await memberIdFor(rig, clientUser().id) });
    await updateCampaign(rig.deps(), rig.actor, id, { status: "paused" });
    expect((await refusal(goLive(id))).code).toBe("no-host");
  });

  it("keeps the accepted version in force while a newer one waits, so the campaign can still go live", async () => {
    const id = await create();
    await makeCampaignReady(rig, id);
    await publishAgreement(rig.deps(), rig.actor, { campaignId: id, monthlyTarget: 20, totalTarget: 120 });
    expect(await goLive(id)).toMatchObject({ status: "active" });
  });

  it("takes the monthly and total numbers from the agreement once it is in force, and refuses to edit them directly", async () => {
    const id = await create();
    await makeCampaignReady(rig, id, { monthlyTarget: 31, totalTarget: 186 });
    expect(await row(id)).toMatchObject({ monthlyTarget: 31, totalTarget: 186 });
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { monthlyTarget: 5 }))).code).toBe("invalid-input");
    expect(await updateCampaign(rig.deps(), rig.actor, id, { monthlyTarget: 31, name: "Same number, new name" })).toMatchObject({ name: "Same number, new name" });
  });
});

describe("closing and reopening", () => {
  const create = async () => (await createCampaign(rig.deps(), rig.actor, input())).id;

  it("closes a running campaign as completed with the time and a note in the audit row, and refuses to close it again", async () => {
    const id = await create();
    await makeCampaignReady(rig, id);
    await updateCampaign(rig.deps(), rig.actor, id, { status: "active" });
    const closed = await closeCampaign(rig.deps(), rig.actor, id, "Client ended the engagement");
    expect(closed).toMatchObject({ status: "completed", closedAt: rig.clock.now });
    expect(await row(id)).toMatchObject({ status: "completed", closedAt: rig.clock.now });
    const [audit] = await auditRowsFor(rig, "campaign.close");
    expect(audit).toMatchObject({ subjectRef: closed.publicRef, before: { status: "active" }, after: { status: "completed", note: "Client ended the engagement" } });
    expect((await refusal(closeCampaign(rig.deps(), rig.actor, id))).code).toBe("invalid-transition");
  });

  it("reopens a closed campaign as a draft, clears the closing time, and then needs the rule to go live again", async () => {
    const id = await create();
    await makeCampaignReady(rig, id);
    await updateCampaign(rig.deps(), rig.actor, id, { status: "active" });
    await closeCampaign(rig.deps(), rig.actor, id);
    const reopened = await reopenCampaign(rig.deps(), rig.actor, id);
    expect(reopened).toMatchObject({ status: "draft", closedAt: null });
    expect((await auditRowsFor(rig, "campaign.reopen"))).toHaveLength(1);
    expect((await refusal(reopenCampaign(rig.deps(), rig.actor, id))).code).toBe("invalid-transition");
    expect(await updateCampaign(rig.deps(), rig.actor, id, { status: "active" })).toMatchObject({ status: "active" });
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: id, memberId: await memberIdFor(rig, userIn(rig, rig.world().kestrel).id) });
    await closeCampaign(rig.deps(), rig.actor, id);
    await reopenCampaign(rig.deps(), rig.actor, id);
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { status: "active" }))).code).toBe("no-host");
  });

  it("closes a draft without it ever running, reopens an archived one, and stamps closed_at on a pause and clears it on a resume", async () => {
    const draft = await create();
    expect(await closeCampaign(rig.deps(), rig.actor, draft)).toMatchObject({ status: "completed" });
    const other = await create();
    await updateCampaign(rig.deps(), rig.actor, other, { status: "archived" });
    expect(await row(other)).toMatchObject({ closedAt: rig.clock.now });
    expect(await reopenCampaign(rig.deps(), rig.actor, other)).toMatchObject({ status: "draft", closedAt: null });
    const running = await create();
    await makeCampaignReady(rig, running);
    await updateCampaign(rig.deps(), rig.actor, running, { status: "active" });
    await updateCampaign(rig.deps(), rig.actor, running, { status: "paused" });
    expect(await row(running)).toMatchObject({ closedAt: rig.clock.now });
    await updateCampaign(rig.deps(), rig.actor, running, { status: "active" });
    expect(await row(running)).toMatchObject({ closedAt: null });
  });

  it("refuses staff and an unknown campaign", async () => {
    const id = await create();
    expect((await refusal(closeCampaign(rig.deps(), rig.staffActor, id))).code).toBe("admin-required");
    expect((await refusal(closeCampaign(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).code).toBe("not-found");
    expect((await refusal(reopenCampaign(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).code).toBe("not-found");
  });

  it("makes a closed campaign read only for hosts: Fynix cannot add or deactivate one, and a new agreement version is refused", async () => {
    const id = await create();
    await makeCampaignReady(rig, id);
    await closeCampaign(rig.deps(), rig.actor, id);
    const kestrelId = await memberIdFor(rig, userIn(rig, rig.world().kestrel).id);
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: id, memberId: kestrelId }))).code).toBe("campaign-closed");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, { campaignId: id, memberId: kestrelId, jobTitle: "x" }))).code).toBe("campaign-closed");
    expect((await refusal(publishAgreement(rig.deps(), rig.actor, { campaignId: id, monthlyTarget: 1, totalTarget: 1 }))).code).toBe("campaign-closed");
  });
});

describe("campaign time zone and meeting length", () => {
  it("default to London time and 30 minutes, and the record says so", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, input());
    expect(created).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
    expect(await row(created.id)).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
  });

  it("are stored when given, and audited", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), timeZone: "Asia/Kolkata", meetingMinutes: 45 });
    expect(created).toMatchObject({ timeZone: "Asia/Kolkata", meetingMinutes: 45 });
    const [audit] = await auditRowsFor(rig, "campaign.create");
    expect(audit).toMatchObject({ after: { timeZone: "Asia/Kolkata", meetingMinutes: 45 } });
  });

  it.each([
    ["an unknown time zone", { timeZone: "Mars/Olympus" }],
    ["an offset instead of a zone", { timeZone: "+01:00" }],
    ["an empty time zone", { timeZone: "" }],
    ["a meeting of 14 minutes", { meetingMinutes: 14 }],
    ["a meeting of 241 minutes", { meetingMinutes: 241 }],
    ["a fractional meeting length", { meetingMinutes: 30.5 }],
  ])("refuse %s, on create and on update, and write nothing", async (_label, change) => {
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...input(), ...change }))).code).toBe("invalid-input");
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, change))).code).toBe("invalid-input");
    expect(await row(id)).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(5);
  });

  it("change on update, with the before and after in the audit row", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    const after = await updateCampaign(rig.deps(), rig.actor, id, { timeZone: "America/New_York", meetingMinutes: 60 });
    expect(after).toMatchObject({ timeZone: "America/New_York", meetingMinutes: 60 });
    const [audit] = await auditRowsFor(rig, "campaign.update");
    expect(audit).toMatchObject({ before: { timeZone: "Europe/London", meetingMinutes: 30 }, after: { timeZone: "America/New_York", meetingMinutes: 60 } });
  });
});

describe("a campaign's agency is its coordinator", () => {
  it("refuses a partner agency as the agency of a new campaign, with not-a-supplier, and writes nothing", async () => {
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: rig.world().northgate.id, name: "Ridgeway Partner Ltd" });
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...input(), agencyOrgId: partner.id }))).code).toBe("not-a-supplier");
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(4);
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["organisation.create"]);
  });
});

describe("campaign set-up is for Fynix admins", () => {
  it("refuses Fynix staff on create and on update", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(createCampaign(rig.deps(), rig.staffActor, input()))).code).toBe("admin-required");
    expect((await refusal(updateCampaign(rig.deps(), rig.staffActor, id, { meetingMinutes: 60 }))).code).toBe("admin-required");
    expect(await row(id)).toMatchObject({ meetingMinutes: 30 });
  });
});
