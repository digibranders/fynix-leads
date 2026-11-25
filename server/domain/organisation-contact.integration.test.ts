import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { organisation } from "@/server/db/schema";
import { readClientDetail } from "@/server/domain/client-overview";
import { createOrganisation, updateOrganisation } from "@/server/domain/organisations";
import { readSupplierDetail } from "@/server/domain/supplier-overview";
import { createPartnerAgency, createSupplier } from "@/server/domain/suppliers";
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

const CONTACT = {
  contactName: "  Asha Rao ",
  contactEmail: " asha@ridgeway.example ",
  contactPhone: "+44 20 7946 0958",
  website: "https://ridgeway.example/about",
  address: "12 Mill Lane\nLeeds LS1 4AB",
  notes: "Prefers email.\nInvoices go to accounts.",
};
const TRIMMED = { ...CONTACT, contactName: "Asha Rao", contactEmail: "asha@ridgeway.example" };

const stored = async (id: string) => (await rig.dbs.owner.db.select().from(organisation).where(eq(organisation.id, id)))[0];

describe("company contact details on create", () => {
  it("are saved trimmed on a client, a coordinator and a partner agency, and audited", async () => {
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Ridgeway Client", ...CONTACT });
    const supplier = await createSupplier(rig.deps(), rig.actor, { name: "Ridgeway Coordinator", ...CONTACT });
    const agency = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: supplier.id, name: "Ridgeway Agency", ...CONTACT });
    for (const created of [client, supplier, agency]) expect(await stored(created.id)).toMatchObject({ contactName: "Asha Rao", contactEmail: "asha@ridgeway.example", website: "https://ridgeway.example/about", address: CONTACT.address, notes: CONTACT.notes });
    const rows = await auditRowsFor(rig, "organisation.create");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.after).toMatchObject(TRIMMED);
  });

  it("are all optional, and a company without them has them empty", async () => {
    const created = await createSupplier(rig.deps(), rig.actor, { name: "Plain Coordinator" });
    expect(await stored(created.id)).toMatchObject({ contactName: null, contactEmail: null, contactPhone: null, website: null, address: null, notes: null });
  });

  it.each([
    ["an email that is not one", { contactEmail: "asha at ridgeway" }],
    ["a website that is not https", { website: "http://ridgeway.example" }],
    ["a website that is not a web address", { website: "ridgeway.example" }],
    ["a script address", { website: "javascript:alert(1)" }],
    ["a phone with letters", { contactPhone: "call me" }],
    ["a contact name that is too long", { contactName: "x".repeat(121) }],
    ["an address that is too long", { address: "x".repeat(501) }],
    ["notes that are too long", { notes: "x".repeat(4001) }],
    ["a blank contact name", { contactName: "   " }],
  ])("refuses %s, and writes nothing", async (_label, extra) => {
    expect((await refusal(createSupplier(rig.deps(), rig.actor, { name: "Refused Coordinator", ...extra }))).code).toBe("invalid-input");
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("updateOrganisation and the contact details", () => {
  it("changes them, keeps the ones left out, clears one with null, and audits before and after", async () => {
    const { kestrel } = rig.world();
    await updateOrganisation(rig.deps(), rig.actor, kestrel.id, CONTACT);
    await updateOrganisation(rig.deps(), rig.actor, kestrel.id, { contactPhone: null, notes: "New note" });
    expect(await stored(kestrel.id)).toMatchObject({ contactName: "Asha Rao", contactPhone: null, notes: "New note", website: "https://ridgeway.example/about" });
    const rows = await auditRowsFor(rig, "organisation.update");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ before: { contactPhone: "+44 20 7946 0958", notes: CONTACT.notes }, after: { contactPhone: null, notes: "New note" } });
  });

  it("works on a coordinator and a partner agency, and shows on the record reads", async () => {
    const { brightpath } = rig.world();
    const agency = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Agency" });
    await updateOrganisation(rig.deps(), rig.actor, brightpath.id, CONTACT);
    await updateOrganisation(rig.deps(), rig.actor, agency.id, { website: "https://agency.example" });
    expect((await readSupplierDetail(rig.deps(), rig.staffActor, brightpath.publicRef)).contact).toEqual(TRIMMED);
    expect((await readClientDetail(rig.deps(), rig.staffActor, rig.world().kestrel.publicRef)).contact.contactEmail).toBeNull();
  });

  it("refuses an invalid value and an empty change, and is refused to staff", async () => {
    const { kestrel } = rig.world();
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, kestrel.id, { website: "http://x.example" }))).code).toBe("invalid-input");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, kestrel.id, {}))).code).toBe("invalid-input");
    expect((await refusal(updateOrganisation(rig.deps(), rig.staffActor, kestrel.id, CONTACT))).code).toBe("admin-required");
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("still renames and sets the time zone as before", async () => {
    const { kestrel } = rig.world();
    const after = await updateOrganisation(rig.deps(), rig.actor, kestrel.id, { name: "Kestrel Ledger Ltd", timeZone: "Europe/London" });
    expect(after).toMatchObject({ name: "Kestrel Ledger Ltd", timeZone: "Europe/London" });
    expect(Object.keys(after)).not.toContain("notes");
  });
});
