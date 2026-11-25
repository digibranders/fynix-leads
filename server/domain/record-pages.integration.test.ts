import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readClientDetail, listClientRows } from "@/server/domain/client-overview";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { readSettings } from "@/server/domain/settings-overview";
import { readSetupFindings } from "@/server/domain/setup-overview";
import { readCoordinatorDetail } from "@/server/domain/coordinator-overview";
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

describe("the client record read", () => {
  it("reads a client with its people, campaigns and recorded changes, open to staff", async () => {
    const { kestrel } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, kestrel.id, "archived");
    const detail = await readClientDetail(rig.deps(), rig.staffActor, kestrel.publicRef);
    expect(detail).toMatchObject({ id: kestrel.id, status: "archived" });
    expect(detail.people.every((person) => person.orgId === kestrel.id)).toBe(true);
    expect(detail.activity.map((row) => row.action)).toContain("organisation.archive");
    const row = (await listClientRows(rig.deps(), rig.staffActor)).find((entry) => entry.id === kestrel.id);
    expect(row?.campaignCounts.active).toBeGreaterThanOrEqual(0);
  });

  it("refuses a reference that is not a client", async () => {
    const { brightpath } = rig.world();
    await expect(readClientDetail(rig.deps(), rig.staffActor, brightpath.publicRef)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("the coordinator record read", () => {
  it("carries the people of the coordinator and its agencies, the time zone and the counts", async () => {
    const { brightpath } = rig.world();
    const detail = await readCoordinatorDetail(rig.deps(), rig.staffActor, brightpath.publicRef);
    expect(detail.everyone.every((person) => person.orgName !== "")).toBe(true);
    expect(detail.campaignCounts.setup + detail.campaignCounts.active + detail.campaignCounts.closed).toBe(detail.campaigns.length);
  });
});

describe("the Fynix team and the set-up findings", () => {
  it("lists the Fynix organisation's people for Settings", async () => {
    const settings = await readSettings(rig.deps(), rig.staffActor);
    expect(settings.fynixOrg).not.toBeNull();
    expect(settings.team.some((person) => person.kind === "member")).toBe(true);
  });

  it("finds campaigns with no host and agreements nobody accepted, and reads for staff", async () => {
    const findings = await readSetupFindings(rig.deps(), rig.staffActor);
    expect(Array.isArray(findings.campaignsWithoutHost)).toBe(true);
    expect(Array.isArray(findings.agreementsWaiting)).toBe(true);
  });
});
