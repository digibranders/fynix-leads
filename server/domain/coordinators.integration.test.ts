import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invite, organisation } from "@/server/db/schema";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency, createPartnerAgencyWithFirstPerson, createCoordinator, createCoordinatorWithFirstPerson, listCoordinators } from "@/server/domain/coordinators";
import { auditRowsFor, publishApprovedTerms, refusal } from "@/server/domain/test-helpers";
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

const organisationCount = async (): Promise<number> => (await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).length;
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe("createCoordinator", () => {
  it("creates an agency with no parent and a generated reference, and audits it", async () => {
    const created = await createCoordinator(rig.deps(), rig.actor, { name: "  Ridgeway Media Pvt Ltd " });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", parentOrgId: null, status: "active" });
    expect(created.publicRef).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "organisation", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { kind: "agency", parentOrgId: null } });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a missing name", {}],
    ["a brand name", { name: "Ridgeway", brandName: "Ridge" }],
    ["a parent", { name: "Ridgeway", parentOrgId: UNKNOWN }],
  ])("refuses %s, and writes nothing", async (_label, input) => {
    expect((await refusal(createCoordinator(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createCoordinator(rig.deps(), rig.staffActor, { name: "Ridgeway Media Pvt Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("createPartnerAgency", () => {
  it("creates an agency under a coordinator and audits it with the parent in the snapshot", async () => {
    const { brightpath } = rig.world();
    const created = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Partner Ltd", parentOrgId: brightpath.id, status: "active" });
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ subjectId: created.id, before: null, after: { kind: "agency", parentOrgId: brightpath.id } });
  });

  it("refuses an unknown coordinator, a client, the Fynix organisation, a partner agency and an archived coordinator, and writes nothing", async () => {
    const { brightpath, kestrel, fynix, northgate } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const before = await organisationCount();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: UNKNOWN, name: "X Ltd" }))).code).toBe("not-found");
    for (const parent of [kestrel.id, fynix.id, partner.id]) {
      expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: parent, name: "X Ltd" }))).code, parent).toBe("not-a-coordinator");
    }
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: northgate.id, name: "X Ltd" }))).code).toBe("organisation-archived");
    expect(await organisationCount()).toBe(before);
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.create", "organisation.archive"]);
  });

  it("refuses an empty name and a field it does not know", async () => {
    const { brightpath } = rig.world();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "X Ltd", kind: "client" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: "not-a-uuid", name: "X Ltd" }))).code).toBe("invalid-input");
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createPartnerAgency(rig.deps(), rig.staffActor, { coordinatorId: rig.world().brightpath.id, name: "X Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
  });
});

const FIRST_PERSON = { name: "Asha Rao", jobTitle: "Founder", email: "asha@ridgeway.example", role: "manager" };
const inviteCount = async (): Promise<number> => (await rig.dbs.owner.db.select({ id: invite.id }).from(invite)).length;

describe("createCoordinator time zone and duplicate names", () => {
  it("stores a valid time zone and audits it, and refuses one that is not an IANA zone", async () => {
    const created = await createCoordinator(rig.deps(), rig.actor, { name: "Ridgeway Media", timeZone: " Asia/Kolkata " });
    expect(created.timeZone).toBe("Asia/Kolkata");
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ after: { timeZone: "Asia/Kolkata" } });
    expect((await refusal(createCoordinator(rig.deps(), rig.actor, { name: "Other Media", timeZone: "Mars/Olympus" }))).code).toBe("invalid-input");
  });

  it("leaves the time zone empty when none is given", async () => {
    expect((await createCoordinator(rig.deps(), rig.actor, { name: "Ridgeway Media" })).timeZone).toBeNull();
  });

  it("refuses a coordinator of the same name in any case, and accepts it once confirmed", async () => {
    await createCoordinator(rig.deps(), rig.actor, { name: "Ridgeway Media" });
    const before = await organisationCount();
    expect((await refusal(createCoordinator(rig.deps(), rig.actor, { name: "  RIDGEWAY media " }))).code).toBe("duplicate-name");
    expect(await organisationCount()).toBe(before);
    const again = await createCoordinator(rig.deps(), rig.actor, { name: "RIDGEWAY media", confirmDuplicate: true });
    expect(again.name).toBe("RIDGEWAY media");
    expect(await organisationCount()).toBe(before + 1);
  });

  it("does not count a partner agency or a client of that name as a duplicate coordinator", async () => {
    const { brightpath, kestrel } = rig.world();
    await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Shared Name" });
    await expect(createCoordinator(rig.deps(), rig.actor, { name: "Shared Name" })).resolves.toMatchObject({ parentOrgId: null });
    await expect(createCoordinator(rig.deps(), rig.actor, { name: kestrel.name.toUpperCase() })).resolves.toMatchObject({ kind: "agency" });
  });
});

describe("createPartnerAgency time zone and duplicate names", () => {
  it("stores the time zone, and refuses a duplicate name among that coordinator's agencies unless confirmed", async () => {
    const { brightpath, northgate } = rig.world();
    const first = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Calder Bay", timeZone: "Europe/London" });
    expect(first.timeZone).toBe("Europe/London");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: " calder bay" }))).code).toBe("duplicate-name");
    await expect(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: northgate.id, name: "Calder Bay" })).resolves.toMatchObject({ parentOrgId: northgate.id });
    await expect(createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "calder bay", confirmDuplicate: true })).resolves.toMatchObject({ parentOrgId: brightpath.id });
  });
});

describe("createCoordinatorWithFirstPerson and createPartnerAgencyWithFirstPerson", () => {
  it("adds the coordinator and queues the invite for its first manager", async () => {
    await publishApprovedTerms(rig);
    const result = await createCoordinatorWithFirstPerson(rig.deps(), rig.actor, { name: "Ridgeway Media" }, FIRST_PERSON);
    expect(result.firstInvite).toEqual({ status: "sent" });
    const [row] = await rig.dbs.owner.db.select({ orgId: invite.orgId, role: invite.role, email: invite.email }).from(invite);
    expect(row).toEqual({ orgId: result.organisation.id, role: "manager", email: "asha@ridgeway.example" });
  });

  it("keeps the coordinator when the invite is refused for lack of terms, and says why", async () => {
    const result = await createCoordinatorWithFirstPerson(rig.deps(), rig.actor, { name: "Ridgeway Media" }, FIRST_PERSON);
    expect(result.firstInvite).toEqual({ status: "failed", code: "no-current-terms" });
    expect(result.organisation).toMatchObject({ name: "Ridgeway Media", status: "active" });
    expect(await inviteCount()).toBe(0);
    expect((await listCoordinators(rig.deps(), rig.actor)).map((row) => row.coordinator.name)).toContain("Ridgeway Media");
  });

  it("keeps the agency when the address already has an account", async () => {
    await publishApprovedTerms(rig);
    const { brightpath } = rig.world();
    const existing = rig.world().users[0]?.email;
    if (existing === undefined) throw new Error("The seed has no user");
    const result = await createPartnerAgencyWithFirstPerson(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Calder Bay" }, { ...FIRST_PERSON, email: existing });
    expect(result.firstInvite).toEqual({ status: "failed", code: "email-in-use" });
    expect(result.organisation.parentOrgId).toBe(brightpath.id);
  });

  it("invites into the new agency, and reports none when no person is given", async () => {
    await publishApprovedTerms(rig);
    const { brightpath } = rig.world();
    const withPerson = await createPartnerAgencyWithFirstPerson(rig.deps(), rig.actor, { coordinatorId: brightpath.id, name: "Calder Bay" }, { ...FIRST_PERSON, role: "member" });
    expect(withPerson.firstInvite).toEqual({ status: "sent" });
    const [row] = await rig.dbs.owner.db.select({ orgId: invite.orgId, role: invite.role, alias: invite.alias }).from(invite);
    expect(row).toEqual({ orgId: withPerson.organisation.id, role: "member", alias: "Asha Rao" });
    expect((await createCoordinatorWithFirstPerson(rig.deps(), rig.actor, { name: "Solo Co" })).firstInvite).toEqual({ status: "none" });
  });

  it("writes nothing at all when the person's details are not valid", async () => {
    const before = await organisationCount();
    expect((await refusal(createCoordinatorWithFirstPerson(rig.deps(), rig.actor, { name: "Ridgeway Media" }, { ...FIRST_PERSON, email: "nope" }))).code).toBe("invalid-input");
    expect(await organisationCount()).toBe(before);
  });
});

describe("listCoordinators", () => {
  it("lists every coordinator by name with its partner agencies, and no client", async () => {
    const { brightpath, northgate } = rig.world();
    expect((await listCoordinators(rig.deps(), rig.actor)).map((row) => [row.coordinator.name, row.agencies.length])).toEqual([
      [brightpath.name, 0],
      [northgate.name, 0],
    ]);
    await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: northgate.id, name: "Zed Partner Ltd" });
    await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: northgate.id, name: "Alpha Partner Ltd" });
    const listed = await listCoordinators(rig.deps(), rig.actor);
    expect(listed.map((row) => row.coordinator.name)).toEqual([brightpath.name, northgate.name]);
    expect(listed[1]?.agencies.map((row) => row.name)).toEqual(["Alpha Partner Ltd", "Zed Partner Ltd"]);
    expect(listed[1]?.agencies.every((row) => row.parentOrgId === northgate.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("Kestrel");
  });

  it("includes an archived coordinator with its status, and is open to Fynix staff", async () => {
    const { northgate } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    const listed = await listCoordinators(rig.deps(), rig.staffActor);
    expect(listed.find((row) => row.coordinator.id === northgate.id)?.coordinator.status).toBe("archived");
  });
});
