import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invite, member, user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { issueInvite } from "@/server/domain/invites";
import { setCampaignShare } from "@/server/domain/shares";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { listCoordinatorRows, readCoordinatorDetail } from "@/server/domain/coordinator-overview";
import { createPartnerAgency, createCoordinator } from "@/server/domain/coordinators";
import { publishApprovedTerms, refusal } from "@/server/domain/test-helpers";
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

/** A person with an account and an active membership in an organisation, written as the owner. */
async function addPerson(orgId: string, kind: "agency" | "client", name: string, email: string, role: "member" | "manager" = "member"): Promise<void> {
  const [row] = await rig.dbs.owner.db.insert(user).values({ email, name }).returning({ id: user.id });
  if (row === undefined) throw new Error("No user was inserted");
  await rig.dbs.owner.db.insert(member).values({ userId: row.id, orgId, orgKind: kind, role, displayName: name });
}

describe("listCoordinatorRows", () => {
  it("lists the seeded coordinators by name with their counts, and leaves out clients and partner agencies", async () => {
    const { brightpath, northgate } = rig.world();
    await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const rows = await listCoordinatorRows(rig.deps(), rig.actor);
    expect(rows.map((row) => row.name)).toEqual([brightpath.name, northgate.name]);
    expect(rows[0]).toMatchObject({ publicRef: brightpath.publicRef, status: "active", agencyCount: 1, agencyNames: ["Ridgeway Partner Ltd"], peopleCount: 1, campaignCount: 2, inviteWaiting: false });
    expect(rows[1]).toMatchObject({ publicRef: northgate.publicRef, agencyCount: 0, peopleCount: 1, campaignCount: 2 });
  });

  it("counts the people of the partner agencies in the coordinator's people", async () => {
    const { brightpath } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    await addPerson(partner.id, "agency", "Partner Person", "partner.person@ridgeway.example");
    const [row] = await listCoordinatorRows(rig.deps(), rig.actor);
    expect(row).toMatchObject({ publicRef: brightpath.publicRef, peopleCount: 2 });
  });

  it("says the invite is waiting for a coordinator with nobody in it and a live invite, and stops saying so once it is revoked", async () => {
    await publishApprovedTerms(rig);
    const created = await createCoordinator(rig.deps(), rig.actor, { name: "Saltmarsh Demand" });
    expect((await listCoordinatorRows(rig.deps(), rig.actor)).find((row) => row.id === created.id)).toMatchObject({ peopleCount: 0, inviteWaiting: false });
    await issueInvite(rig.deps(), rig.actor, { organisationId: created.id, email: "lead@saltmarsh.example", name: "Lead Person", jobTitle: "Operations lead", role: "manager", alias: "Saltmarsh, Fynix" });
    expect((await listCoordinatorRows(rig.deps(), rig.actor)).find((row) => row.id === created.id)).toMatchObject({ peopleCount: 0, inviteWaiting: true });
    await rig.dbs.owner.db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.orgId, created.id));
    expect((await listCoordinatorRows(rig.deps(), rig.actor)).find((row) => row.id === created.id)?.inviteWaiting).toBe(false);
  });

  it("includes archived coordinators with their status, and is open to Fynix staff", async () => {
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().northgate.id, "archived");
    const rows = await listCoordinatorRows(rig.deps(), rig.staffActor);
    expect(rows.map((row) => row.status)).toEqual(["active", "archived"]);
  });
});

describe("readCoordinatorDetail", () => {
  it("reads a coordinator with its partner agencies, its people with their emails, and its campaigns with their clients", async () => {
    await publishApprovedTerms(rig);
    const { brightpath, kestrel, halden } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    await addPerson(partner.id, "agency", "Partner Person", "partner.person@ridgeway.example");
    await issueInvite(rig.deps(), rig.actor, { organisationId: brightpath.id, email: "new.hire@brightpath.example", name: "New Hire", jobTitle: "Operations lead", role: "member", alias: "Bright, Fynix" });

    const detail = await readCoordinatorDetail(rig.deps(), rig.staffActor, brightpath.publicRef);
    expect(detail).toMatchObject({ id: brightpath.id, publicRef: brightpath.publicRef, name: brightpath.name, status: "active", peopleTotal: 2 });
    expect(detail.agencies).toEqual([{ id: partner.id, publicRef: partner.publicRef, name: "Ridgeway Partner Ltd", status: "active", peopleCount: 1, campaignCount: 0 }]);
    expect(detail.people).toEqual([
      { name: "Person 4 of ORG-2B6R", email: "person4@org-2b6r.example", role: "member", state: "active" },
      { name: "New Hire", email: "new.hire@brightpath.example", role: "member", state: "invited" },
    ]);
    expect(detail.campaigns.map((row) => [row.clientName, row.status])).toEqual(expect.arrayContaining([[kestrel.name, "draft"], [halden.name, "draft"]]));
    expect(detail.campaigns).toHaveLength(2);
  });

  it("shows an invite past its expiry as expired, and a suspended member as suspended", async () => {
    await publishApprovedTerms(rig);
    const { brightpath } = rig.world();
    await issueInvite(rig.deps(), rig.actor, { organisationId: brightpath.id, email: "late@brightpath.example", name: "Late Person", jobTitle: "Operations lead", role: "member", alias: "Late, Fynix" });
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.orgId, brightpath.id));
    rig.clock.now = new Date(Date.now() + 8 * 86_400_000);
    const detail = await readCoordinatorDetail(rig.deps(), rig.actor, brightpath.publicRef);
    expect(detail.people.map((person) => person.state)).toEqual(["suspended", "invite-expired"]);
  });

  it("counts the campaigns a partner agency holds a share of", async () => {
    const { brightpath } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const [firstOfBrightpath] = (await listCoordinatorRows(rig.deps(), rig.actor)).filter((row) => row.id === brightpath.id);
    expect(firstOfBrightpath?.campaignCount).toBe(2);
    const campaignId = rig.world().campaigns.find((row) => row.agency.id === brightpath.id)?.id;
    if (campaignId === undefined) throw new Error("No campaign for Brightpath");
    await setCampaignShare(rig.deps(), rig.actor, { campaignId, agencyOrgId: partner.id, monthlyShare: 3 });
    expect((await readCoordinatorDetail(rig.deps(), rig.actor, brightpath.publicRef)).agencies[0]?.campaignCount).toBe(1);
  });

  it("answers not-found for an unknown or malformed reference, a client, a partner agency and the Fynix organisation", async () => {
    const { brightpath, kestrel, fynix } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    for (const ref of ["ORG-ZZZZ", "nonsense", "", kestrel.publicRef, partner.publicRef, fynix.publicRef]) {
      expect((await refusal(readCoordinatorDetail(rig.deps(), rig.actor, ref))).code, ref).toBe("not-found");
    }
  });
});
