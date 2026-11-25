import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { clientCollateral, organisation } from "@/server/db/schema";
import { auditRowsFor, scriptedBytes } from "@/server/domain/test-helpers";
import { DomainError } from "@/server/domain/errors";
import { addCollateral, createOrganisation, readClientProfile, removeCollateral, setOrganisationStatus, updateClientProfile, updateOrganisation } from "@/server/domain/organisations";
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
const CLIENT = { kind: "client", name: "Orchard Foods Ltd" } as const;
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
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", status: "active" });
    expect(created.publicRef).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "organisation", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { ref: created.publicRef, kind: "agency", name: "Ridgeway Media Pvt Ltd", status: "active" } });
  });

  it("creates a client with its one name", async () => {
    const created = await createOrganisation(rig.deps(), rig.actor, CLIENT);
    expect(created).toMatchObject({ kind: "client", name: "Orchard Foods Ltd" });
    expect(created).not.toHaveProperty("brandName");
  });

  it.each([
    ["a brand name on a client", { kind: "client", name: "Brand Client Ltd", brandName: "Brand" }],
    ["a brand name on an agency", { kind: "agency", name: "Brand Agency Ltd", brandName: "Brand" }],
    ["a time zone that does not exist", { kind: "client", name: "Zone Ltd", timeZone: "Mars/Olympus" }],
    ["a second Fynix organisation", { kind: "fynix", name: "Another Fynix" }],
    ["an empty name", { kind: "agency", name: "   " }],
  ])("refuses %s as invalid input, and writes nothing", async (_label, input) => {
    expect((await refusal(createOrganisation(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("takes a time zone and a profile in the same transaction", async () => {
    const profile = { introduction: "A family grocer", services: "Fresh produce", differentiator: "Picked the same day", caseStudies: "Cut waste by 20 percent" };
    const created = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Orchard Foods Ltd", timeZone: "Europe/Dublin", profile });
    expect(created).toMatchObject({ name: "Orchard Foods Ltd", timeZone: "Europe/Dublin" });
    expect((await readClientProfile(rig.deps(), rig.staffActor, created.id)).profile).toEqual({ clientOrgId: created.id, ...profile });
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.create", "client_profile.update"]);
  });

  it("warns about a second company of the same kind and name, in any case, until the caller confirms", async () => {
    await createOrganisation(rig.deps(), rig.actor, CLIENT);
    expect((await refusal(createOrganisation(rig.deps(), rig.actor, { ...CLIENT, name: "  orchard FOODS ltd " }))).code).toBe("duplicate-name");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(6);
    await createOrganisation(rig.deps(), rig.actor, { kind: "agency", name: "Orchard Foods Ltd" });
    const again = await createOrganisation(rig.deps(), rig.actor, { ...CLIENT, confirmDuplicate: true });
    expect(again.name).toBe("Orchard Foods Ltd");
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
  it("renames an organisation and audits the before and after", async () => {
    const { kestrel } = rig.world();
    const after = await updateOrganisation(rig.deps(), rig.actor, kestrel.id, { name: "Kestrel Freight Ltd" });
    expect(after).toMatchObject({ name: "Kestrel Freight Ltd" });
    const [audit] = await auditRowsFor(rig, "organisation.update");
    expect(audit).toMatchObject({ before: { ref: kestrel.publicRef, name: "Kestrel Logistics Ltd" }, after: { ref: kestrel.publicRef, name: "Kestrel Freight Ltd" } });
  });

  it("refuses a brand name, the Fynix organisation, an unknown id and an empty change", async () => {
    const { brightpath, fynix } = rig.world();
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, brightpath.id, { brandName: "Brightpath" }))).code).toBe("invalid-input");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, rig.world().kestrel.id, { brandName: "Kestrel" }))).code).toBe("invalid-input");
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

describe("updateOrganisation, time zone and rename", () => {
  it("sets and clears the time zone, and audits it", async () => {
    const id = rig.world().kestrel.id;
    expect(await updateOrganisation(rig.deps(), rig.actor, id, { timeZone: "Asia/Kolkata" })).toMatchObject({ timeZone: "Asia/Kolkata" });
    expect(await updateOrganisation(rig.deps(), rig.actor, id, { timeZone: null })).toMatchObject({ timeZone: null });
    expect((await auditRowsFor(rig, "organisation.update"))[0]?.after).toMatchObject({ timeZone: "Asia/Kolkata" });
  });

  it("refuses a time zone that does not exist", async () => {
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, rig.world().kestrel.id, { timeZone: "Mars/Olympus" }))).code).toBe("invalid-input");
  });

  it("refuses staff", async () => {
    expect((await refusal(updateOrganisation(rig.deps(), rig.staffActor, rig.world().kestrel.id, { timeZone: "UTC" }))).code).toBe("admin-required");
  });
});

describe("the client profile and its collateral", () => {
  const PROFILE = { introduction: "A family grocer", services: "Fresh produce", differentiator: "Picked the same day" };

  it("creates the profile on first save and replaces it after, with an audit row each time", async () => {
    const id = (await createOrganisation(rig.deps(), rig.actor, CLIENT)).id;
    await updateClientProfile(rig.deps(), rig.actor, { clientOrgId: id, ...PROFILE });
    await updateClientProfile(rig.deps(), rig.actor, { clientOrgId: id, ...PROFILE, services: "Fresh and frozen produce", caseStudies: "Cut waste" });
    expect((await readClientProfile(rig.deps(), rig.actor, id)).profile).toMatchObject({ services: "Fresh and frozen produce", caseStudies: "Cut waste" });
    const audits = await auditRowsFor(rig, "client_profile.update");
    expect(audits).toHaveLength(2);
    expect(audits[0]?.before).toBeNull();
    expect(audits[1]?.before).toMatchObject({ services: "Fresh produce" });
  });

  it("refuses a profile for an agency, an incomplete profile, and staff", async () => {
    expect((await refusal(updateClientProfile(rig.deps(), rig.actor, { clientOrgId: rig.world().northgate.id, ...PROFILE }))).code).toBe("invalid-input");
    expect((await refusal(updateClientProfile(rig.deps(), rig.actor, { clientOrgId: rig.world().kestrel.id, introduction: "x" }))).code).toBe("invalid-input");
    expect((await refusal(updateClientProfile(rig.deps(), rig.staffActor, { clientOrgId: rig.world().kestrel.id, ...PROFILE }))).code).toBe("admin-required");
  });

  it("adds a link, lists it, and removes it from view without deleting the row", async () => {
    const id = (await createOrganisation(rig.deps(), rig.actor, CLIENT)).id;
    const added = await addCollateral(rig.deps(), rig.actor, { clientOrgId: id, kind: "link", title: "Brochure", url: "https://example.com/brochure.pdf" });
    expect((await readClientProfile(rig.deps(), rig.staffActor, id)).collateral).toMatchObject([{ id: added.id, title: "Brochure", url: "https://example.com/brochure.pdf" }]);
    await removeCollateral(rig.deps(), rig.actor, added.id);
    expect((await readClientProfile(rig.deps(), rig.staffActor, id)).collateral).toEqual([]);
    const [kept] = await rig.dbs.owner.db.select({ removedAt: clientCollateral.removedAt }).from(clientCollateral).where(eq(clientCollateral.id, added.id));
    expect(kept?.removedAt).not.toBeNull();
    expect((await refusal(removeCollateral(rig.deps(), rig.actor, added.id))).code).toBe("invalid-transition");
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.create", "client_collateral.add", "client_collateral.remove"]);
  });

  it("refuses a file (uploads are not wired yet), a link that is not http or https, and staff", async () => {
    const id = rig.world().kestrel.id;
    expect((await refusal(addCollateral(rig.deps(), rig.actor, { clientOrgId: id, kind: "file", title: "Deck", url: "https://example.com/a" }))).code).toBe("invalid-input");
    expect((await refusal(addCollateral(rig.deps(), rig.actor, { clientOrgId: id, kind: "link", title: "Deck", url: "javascript:alert(1)" }))).code).toBe("invalid-input");
    expect((await refusal(addCollateral(rig.deps(), rig.staffActor, { clientOrgId: id, kind: "link", title: "Deck", url: "https://example.com/a" }))).code).toBe("admin-required");
  });
});
