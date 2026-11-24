import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { organisation } from "@/server/db/schema";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency, createSupplier, listSuppliers } from "@/server/domain/suppliers";
import { auditRowsFor, refusal } from "@/server/domain/test-helpers";
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

describe("createSupplier", () => {
  it("creates an agency with no parent and a generated reference, and audits it", async () => {
    const created = await createSupplier(rig.deps(), rig.actor, { name: "  Ridgeway Media Pvt Ltd " });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, parentOrgId: null, status: "active" });
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
    expect((await refusal(createSupplier(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createSupplier(rig.deps(), rig.staffActor, { name: "Ridgeway Media Pvt Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("createPartnerAgency", () => {
  it("creates an agency under a coordinator and audits it with the parent in the snapshot", async () => {
    const { brightpath } = rig.world();
    const created = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Partner Ltd", parentOrgId: brightpath.id, status: "active" });
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ subjectId: created.id, before: null, after: { kind: "agency", parentOrgId: brightpath.id } });
  });

  it("refuses an unknown coordinator, a client, the Fynix organisation, a partner agency and an archived coordinator, and writes nothing", async () => {
    const { brightpath, kestrel, fynix, northgate } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const before = await organisationCount();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: UNKNOWN, name: "X Ltd" }))).code).toBe("not-found");
    for (const parent of [kestrel.id, fynix.id, partner.id]) {
      expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: parent, name: "X Ltd" }))).code, parent).toBe("not-a-supplier");
    }
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "X Ltd" }))).code).toBe("organisation-archived");
    expect(await organisationCount()).toBe(before);
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.create", "organisation.archive"]);
  });

  it("refuses an empty name and a field it does not know", async () => {
    const { brightpath } = rig.world();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "X Ltd", kind: "client" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: "not-a-uuid", name: "X Ltd" }))).code).toBe("invalid-input");
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createPartnerAgency(rig.deps(), rig.staffActor, { supplierId: rig.world().brightpath.id, name: "X Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
  });
});

describe("listSuppliers", () => {
  it("lists every coordinator by name with its partner agencies, and no client", async () => {
    const { brightpath, northgate } = rig.world();
    expect((await listSuppliers(rig.deps(), rig.actor)).map((row) => [row.supplier.name, row.agencies.length])).toEqual([
      [brightpath.name, 0],
      [northgate.name, 0],
    ]);
    await createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "Zed Partner Ltd" });
    await createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "Alpha Partner Ltd" });
    const listed = await listSuppliers(rig.deps(), rig.actor);
    expect(listed.map((row) => row.supplier.name)).toEqual([brightpath.name, northgate.name]);
    expect(listed[1]?.agencies.map((row) => row.name)).toEqual(["Alpha Partner Ltd", "Zed Partner Ltd"]);
    expect(listed[1]?.agencies.every((row) => row.parentOrgId === northgate.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("Kestrel");
  });

  it("includes an archived coordinator with its status, and is open to Fynix staff", async () => {
    const { northgate } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    const listed = await listSuppliers(rig.deps(), rig.staffActor);
    expect(listed.find((row) => row.supplier.id === northgate.id)?.supplier.status).toBe("archived");
  });
});
