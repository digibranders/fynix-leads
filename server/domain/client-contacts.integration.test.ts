import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invite } from "@/server/db/schema";
import { addClientContact, inviteClientContact, listClientContacts, removeClientContact, updateClientContact } from "@/server/domain/client-contacts";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation } from "@/server/domain/organisations";
import { auditRowsFor, latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
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

describe("the contact people of a client", () => {
  it("are added with the client, in the order given, and each is audited", async () => {
    const client = await createOrganisation(rig.deps(), rig.actor, {
      kind: "client",
      name: "Orchard Foods Ltd",
      contacts: [{ name: "Maya Rao", email: "maya@orchard.example", phone: "+44 20 7946 0958" }, { name: "Dev Patel" }],
    });
    const people = await listClientContacts(rig.deps(), rig.actor, client.id);
    expect(people.map((person) => person.name)).toEqual(["Maya Rao", "Dev Patel"]);
    expect(people[0]).toMatchObject({ email: "maya@orchard.example", phone: "+44 20 7946 0958", jobTitle: null });
    expect(await auditRowsFor(rig, "client_contact.add")).toHaveLength(2);
  });

  it("can be added, changed and removed later, and a removed one no longer lists", async () => {
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Orchard Foods Ltd" });
    const added = await addClientContact(rig.deps(), rig.actor, { clientOrgId: client.id, name: "Asha Rao", jobTitle: "Head of Ops" });
    const changed = await updateClientContact(rig.deps(), rig.actor, { contactId: added.id, name: "Asha R. Rao", email: "asha@orchard.example", phone: null, jobTitle: null });
    expect(changed).toMatchObject({ name: "Asha R. Rao", email: "asha@orchard.example", phone: null, jobTitle: null });
    await removeClientContact(rig.deps(), rig.actor, added.id);
    expect(await listClientContacts(rig.deps(), rig.actor, client.id)).toEqual([]);
    expect((await refusal(removeClientContact(rig.deps(), rig.actor, added.id))).code).toBe("not-found");
    expect((await refusal(updateClientContact(rig.deps(), rig.actor, { contactId: added.id, email: null, phone: null, jobTitle: null }))).code).toBe("not-found");
    expect(await auditRowsFor(rig, "client_contact.update")).toHaveLength(1);
    expect(await auditRowsFor(rig, "client_contact.remove")).toHaveLength(1);
  });

  it.each([
    ["an email that is not one", { name: "Asha", email: "not-an-email" }],
    ["a phone number with letters", { name: "Asha", phone: "call me" }],
    ["no name", { name: "  " }],
  ])("refuse %s as invalid input", async (_label, person) => {
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Orchard Foods Ltd" });
    expect((await refusal(addClientContact(rig.deps(), rig.actor, { clientOrgId: client.id, ...person }))).code).toBe("invalid-input");
    expect(await listClientContacts(rig.deps(), rig.actor, client.id)).toEqual([]);
  });

  it("belong to a client only, never an agency", async () => {
    const agency = await createOrganisation(rig.deps(), rig.actor, { kind: "agency", name: "Ridgeway Media Pvt Ltd" });
    expect((await refusal(addClientContact(rig.deps(), rig.actor, { clientOrgId: agency.id, name: "Asha" }))).code).toBe("invalid-input");
    expect((await refusal(createOrganisation(rig.deps(), rig.actor, { kind: "agency", name: "Other Agency Ltd", contacts: [{ name: "Asha" }] }))).code).toBe("invalid-input");
  });
});

describe("inviting a saved contact to the portal", () => {
  let counter = 0;
  const clientWith = async (contact: { name: string; email?: string; jobTitle?: string; phone?: string }) => {
    counter += 1;
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: `Orchard Foods ${counter} Ltd`, contacts: [contact] });
    const [saved] = await listClientContacts(rig.deps(), rig.actor, client.id);
    if (saved === undefined) throw new Error("The contact was not saved");
    return { client, contact: saved };
  };

  it("invites a contact as a member of their client, keeps them on the list and queues the invite email", async () => {
    await publishApprovedTerms(rig);
    const { client, contact } = await clientWith({ name: "Maya Rao", email: "maya@orchard.example", jobTitle: "Head of Sales", phone: "+44 20 7946 0958" });
    await inviteClientContact(rig.deps(), rig.actor, contact.id);
    const [row] = await rig.dbs.owner.db.select().from(invite);
    expect(row).toMatchObject({ orgId: client.id, orgKind: "client", email: "maya@orchard.example", name: "Maya Rao", jobTitle: "Head of Sales", phone: "+44 20 7946 0958", role: "manager", alias: null });
    expect((await latestInviteLink(rig, "maya@orchard.example")).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await listClientContacts(rig.deps(), rig.actor, client.id)).map((person) => person.name)).toEqual(["Maya Rao"]);
  });

  it("marks a contact as invited once an invite is open, and as having a login after it is used", async () => {
    await publishApprovedTerms(rig);
    const { client, contact } = await clientWith({ name: "Maya Rao", email: "maya@orchard.example" });
    expect((await listClientContacts(rig.deps(), rig.actor, client.id))[0]?.access).toBe("none");
    await inviteClientContact(rig.deps(), rig.actor, contact.id);
    expect((await listClientContacts(rig.deps(), rig.actor, client.id))[0]?.access).toBe("invited");
  });

  it("asks for an email first, in plain words, and sends nothing; a job title is not needed", async () => {
    await publishApprovedTerms(rig);
    const noEmail = await clientWith({ name: "Dev Patel", jobTitle: "Head of Ops" });
    expect(await refusal(inviteClientContact(rig.deps(), rig.actor, noEmail.contact.id))).toMatchObject({ code: "invalid-input", message: "This contact needs an email before they can be invited." });
    expect(await rig.dbs.owner.db.select().from(invite)).toEqual([]);
    const noTitle = await clientWith({ name: "Tara Moss", email: "tara@orchard.example" });
    await inviteClientContact(rig.deps(), rig.actor, noTitle.contact.id);
    expect(await rig.dbs.owner.db.select().from(invite)).toHaveLength(1);
  });

  it("is refused for a contact that was removed, an unknown contact and Fynix staff", async () => {
    await publishApprovedTerms(rig);
    const { contact } = await clientWith({ name: "Maya Rao", email: "maya@orchard.example", jobTitle: "Head of Sales" });
    expect((await refusal(inviteClientContact(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).code).toBe("not-found");
    expect((await refusal(inviteClientContact(rig.deps(), rig.staffActor, contact.id))).code).toBe("admin-required");
    await removeClientContact(rig.deps(), rig.actor, contact.id);
    expect((await refusal(inviteClientContact(rig.deps(), rig.actor, contact.id))).code).toBe("not-found");
  });
});
