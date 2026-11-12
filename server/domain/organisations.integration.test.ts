import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { campaign, organisation } from "@/server/db/schema";
import { auditRowsFor, scriptedBytes } from "@/server/domain/test-helpers";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation, setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
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

const AGENCY = { kind: "agency", name: "Ridgeway Media Pvt Ltd" } as const;
const CLIENT = { kind: "client", name: "Orchard Foods Ltd", brandName: "Orchard" } as const;
const refusal = async (work: Promise<unknown>): Promise<DomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};

describe("createOrganisation", () => {
  it("creates an agency with a generated reference, and audits it", async () => {
    const created = await createOrganisation(rig.deps(), rig.actor, AGENCY);
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, status: "active" });
    expect(created.publicRef).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "organisation", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { ref: created.publicRef, kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, status: "active" } });
  });

  it("creates a client with its brand name", async () => {
    const created = await createOrganisation(rig.deps(), rig.actor, CLIENT);
    expect(created).toMatchObject({ kind: "client", brandName: "Orchard" });
  });

  it.each([
    ["a client with no brand", { kind: "client", name: "No Brand Ltd" }],
    ["a second Fynix organisation", { kind: "fynix", name: "Another Fynix" }],
    ["an empty name", { kind: "agency", name: "   " }],
  ])("refuses %s as invalid input, and writes nothing", async (_label, input) => {
    expect((await refusal(createOrganisation(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("tries another reference when the first is taken, inside the same transaction, and still audits the change", async () => {
    // ORG-4K9P is Kestrel's: [4, 19, 9, 22] in the reference alphabet. The first two attempts collide with it.
    const randomBytes: RandomBytes = scriptedBytes([[4, 19, 9, 22], [4, 19, 9, 22], [1, 2, 3, 5]]);
    const created = await createOrganisation(rig.deps({ randomBytes }), rig.actor, AGENCY);
    expect(created.publicRef).toBe("ORG-1235");
    expect(await auditRowsFor(rig, "organisation.create")).toHaveLength(1);
  });

  it("gives up with a ref-exhausted error when every reference is taken, and writes nothing", async () => {
    const randomBytes: RandomBytes = scriptedBytes([[4, 19, 9, 22]]);
    expect((await refusal(createOrganisation(rig.deps({ randomBytes }), rig.actor, AGENCY))).code).toBe("ref-exhausted");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("updateOrganisation", () => {
  it("renames an organisation, audits the before and after, and follows a brand change onto the client's campaigns", async () => {
    const { kestrel } = rig.world();
    const after = await updateOrganisation(rig.deps(), rig.actor, kestrel.id, { name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" });
    expect(after).toMatchObject({ name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" });
    const [audit] = await auditRowsFor(rig, "organisation.update");
    expect(audit).toMatchObject({ before: { ref: kestrel.publicRef, name: "Kestrel Logistics Ltd", brandName: "Kestrel" }, after: { ref: kestrel.publicRef, name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" } });
    const brands = await rig.dbs.owner.db.select({ brand: campaign.clientBrandName }).from(campaign).where(eq(campaign.clientOrgId, kestrel.id));
    expect(brands.map((row) => row.brand)).toEqual(["Kestrel Freight", "Kestrel Freight"]);
  });

  it("refuses a brand name for an agency, the Fynix organisation, an unknown id and an empty change", async () => {
    const { brightpath, fynix } = rig.world();
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, brightpath.id, { brandName: "Brightpath" }))).code).toBe("invalid-input");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, fynix.id, { name: "New" }))).code).toBe("invalid-transition");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", { name: "New" }))).code).toBe("not-found");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, brightpath.id, {}))).code).toBe("invalid-input");
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("setOrganisationStatus", () => {
  it("archives and restores, with its own audit action each time, and deletes nothing", async () => {
    const { halden } = rig.world();
    expect(await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived")).toMatchObject({ status: "archived" });
    expect(await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "active")).toMatchObject({ status: "active" });
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.archive", "organisation.restore"]);
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
  });

  it("refuses to archive what is archived already, and the Fynix organisation", async () => {
    const { halden, fynix } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived");
    expect((await refusal(setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived"))).code).toBe("invalid-transition");
    expect((await refusal(setOrganisationStatus(rig.deps(), rig.actor, fynix.id, "archived"))).code).toBe("invalid-transition");
  });
});
