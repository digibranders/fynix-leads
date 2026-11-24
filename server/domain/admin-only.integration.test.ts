import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { issueInvite, resendInvite, revokeInvite } from "@/server/domain/invites";
import { reactivateMember, renameMember, setAgencyAlias, suspendMember } from "@/server/domain/members";
import { createOrganisation, setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
import { publishTerms } from "@/server/domain/terms";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Every set-up function from phase 1C is refused to Fynix staff. They all go through `fynixWrite`, so one rule covers them,
 * and this file is the proof that none was left out. The phase 1D functions have the same case in their own test files.
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
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe("Fynix staff cannot change set-up", () => {
  const calls: readonly (readonly [string, () => Promise<unknown>])[] = [
    ["createOrganisation", async () => createOrganisation(rig.deps(), rig.staffActor, { kind: "agency", name: "Ridgeway Media Pvt Ltd" })],
    ["updateOrganisation", async () => updateOrganisation(rig.deps(), rig.staffActor, rig.world().kestrel.id, { name: "Kestrel Group Ltd" })],
    ["setOrganisationStatus", async () => setOrganisationStatus(rig.deps(), rig.staffActor, rig.world().kestrel.id, "archived")],
    [
      "createCampaign",
      async () =>
        createCampaign(rig.deps(), rig.staffActor, { clientOrgId: rig.world().kestrel.id, agencyOrgId: rig.world().northgate.id, name: "Benelux cold chain", startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 12, totalTarget: 72 }),
    ],
    ["updateCampaign", async () => updateCampaign(rig.deps(), rig.staffActor, firstCampaign(rig).id, { name: "Renamed" })],
    ["issueInvite", async () => issueInvite(rig.deps(), rig.staffActor, { organisationId: rig.world().kestrel.id, email: "new.person@example.com", name: "New Person", jobTitle: "Operations lead" })],
    ["resendInvite", async () => resendInvite(rig.deps(), rig.staffActor, UNKNOWN)],
    ["revokeInvite", async () => revokeInvite(rig.deps(), rig.staffActor, UNKNOWN)],
    ["publishTerms", async () => publishTerms(rig.deps(), rig.staffActor, { party: "client", title: "Terms for client users", body: "The terms, version one." })],
    ["suspendMember", async () => suspendMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id))],
    ["reactivateMember", async () => reactivateMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id))],
    ["renameMember", async () => renameMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id), "New Name")],
    ["setAgencyAlias", async () => setAgencyAlias(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().brightpath).id), "Rae, Fynix")],
  ];

  it.each(calls)("%s is refused with admin-required", async (_name, call) => {
    expect((await refusal(call())).code).toBe("admin-required");
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});
