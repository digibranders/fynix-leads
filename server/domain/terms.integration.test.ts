import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { termsAcceptance, termsDocument } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite } from "@/server/domain/fynix-write";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { publishTerms, readCurrentTerms, recordAcceptance } from "@/server/domain/terms";
import { auditRowsFor } from "@/server/domain/test-helpers";
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

const documents = () => rig.dbs.owner.db.select({ party: termsDocument.party, version: termsDocument.version, status: termsDocument.status, placeholder: termsDocument.placeholder }).from(termsDocument).orderBy(termsDocument.party, termsDocument.version);
const TEXT = { party: "client", title: "Terms for clients", body: "Version one of the terms." } as const;
const userOf = (kind: "fynix" | "client" | "agency") => {
  const person = rig.world().users.find((candidate) => candidate.organisation.kind === kind);
  if (person === undefined) throw new Error(`No seeded ${kind} user`);
  return person;
};

describe("publishTerms", () => {
  it("publishes the first version as current, not placeholder, and audits it", async () => {
    const published = await publishTerms(rig.deps(), rig.actor, TEXT);
    expect(published.version).toBe(1);
    expect(await documents()).toEqual([{ party: "client", version: 1, status: "current", placeholder: false }]);
    const [audit] = await auditRowsFor(rig, "terms.publish");
    expect(audit).toMatchObject({ subjectTable: "terms_document", subjectId: published.id, before: null, after: { version: 1, title: "Terms for clients", party: "client", placeholder: false } });
  });

  it("supersedes the old version when a new one is published, so there is one current version and the users must accept the new text", async () => {
    const first = await publishTerms(rig.deps(), rig.actor, TEXT);
    const second = await publishTerms(rig.deps(), rig.actor, { ...TEXT, title: "Terms for clients, version two", body: "Version two." });
    expect(second.version).toBe(2);
    expect(await documents()).toEqual([
      { party: "client", version: 1, status: "superseded", placeholder: false },
      { party: "client", version: 2, status: "current", placeholder: false },
    ]);
    expect((await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client"))?.id).toBe(second.id);
    const audits = await auditRowsFor(rig, "terms.publish");
    expect(audits[1]).toMatchObject({ before: { version: 1, title: "Terms for clients", status: "current" }, after: { version: 2 } });
    expect(first.id).not.toBe(second.id);
  });

  it("numbers each party's versions on its own", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    await publishTerms(rig.deps(), rig.actor, TEXT);
    expect((await documents()).map((row) => `${row.party} ${row.version} ${row.status}`)).toEqual(["client 1 superseded", "client 2 current", "agency 1 current"]);
  });

  it("refuses an empty title or body, and a party that does not exist", async () => {
    for (const input of [{ ...TEXT, title: " " }, { ...TEXT, body: "" }, { ...TEXT, party: "everyone" }]) {
      try {
        await publishTerms(rig.deps(), rig.actor, input);
        throw new Error("Expected a refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("invalid-input");
      }
    }
    expect(await documents()).toEqual([]);
  });

  it("never edits a published text: Fynix cannot update the body or the title, only the status", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    for (const statement of ["update terms_document set body = 'changed'", "update terms_document set title = 'changed'", "update terms_document set placeholder = false", "delete from terms_document"]) {
      expect(await captureErrorText(queryAs(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, statement)), statement).toContain("permission denied for table terms_document");
    }
  });

  it("allows only one current version per party, even for a write that bypasses the service", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    const message = await captureErrorText(
      fynixWrite(rig.deps().fynixDb, rig.actor, async ({ tx, audit }) => {
        await tx.insert(termsDocument).values({ party: "client", version: 2, title: "t", body: "b" });
        await audit({ action: "terms.publish", subject: { table: "terms_document", id: rig.actor.userId } });
      }),
    );
    expect(message).toContain("terms_document_one_current");
  });
});

describe("readCurrentTerms", () => {
  it("is null for a party with no terms, and the current version otherwise", async () => {
    expect(await readCurrentTerms(rig.dbs.roles.leads_auth.db, "agency")).toBeNull();
    await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    expect(await readCurrentTerms(rig.dbs.roles.leads_auth.db, "agency")).toMatchObject({ party: "agency", version: 1, title: "Terms for agencies", placeholder: false });
  });
});

describe("recordAcceptance, as leads_auth", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;
  const accepted = () => rig.dbs.owner.db.select().from(termsAcceptance);

  it("records the user, the version, the party, the time and the network address", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" });
    expect(await accepted()).toMatchObject([{ userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" }]);
    expect((await accepted())[0]?.acceptedAt).toBeInstanceOf(Date);
  });

  it("refuses a version that is no longer current: the user must accept the new one", async () => {
    const old = await publishTerms(rig.deps(), rig.actor, TEXT);
    await publishTerms(rig.deps(), rig.actor, TEXT);
    const message = await captureErrorText(recordAcceptance(authDb(), { userId: userOf("client").id, documentId: old.id, party: "client", networkAddress: "x" }));
    expect(message).toContain('new row violates row-level security policy for table "terms_acceptance"');
    expect(await accepted()).toEqual([]);
  });

  it("refuses the terms of another party, whether the row says the true party or claims the user's own", async () => {
    const agencyTerms = await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    const client = userOf("client");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: client.id, documentId: agencyTerms.id, party: "agency", networkAddress: "x" }))).toContain("row-level security");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: client.id, documentId: agencyTerms.id, party: "client", networkAddress: "x" }))).toContain("terms_acceptance_document_fk");
    expect(await accepted()).toEqual([]);
  });

  it("refuses a user who belongs to no organisation, and a second acceptance of the same version", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: "99999999-9999-4999-8999-999999999999", documentId: id, party: "client", networkAddress: "x" }))).toContain("violates");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "x" });
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "y" }))).toContain("terms_acceptance_user_document_unique");
  });

  it("is readable by Fynix, who sees who accepted which version, and by nobody else on the identity side", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" });
    const seen = await queryAs(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, "select user_id, network_address from terms_acceptance");
    expect(seen).toEqual([{ user_id: person.id, network_address: "203.0.113.9" }]);
    expect(await captureErrorText(queryAs(authDb(), null, "select * from terms_acceptance"))).toContain("permission denied for table terms_acceptance");
    expect(await rig.dbs.owner.db.select({ id: termsAcceptance.id }).from(termsAcceptance).where(eq(termsAcceptance.userId, person.id))).toHaveLength(1);
  });
});

describe("seedPlaceholderTerms", () => {
  it("writes version 1 for every party, marked placeholder and current", async () => {
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual(["client", "agency", "fynix"]);
    // Ordered the way Postgres orders the organisation_kind enum: fynix, client, agency.
    expect(await documents()).toEqual([
      { party: "fynix", version: 1, status: "current", placeholder: true },
      { party: "client", version: 1, status: "current", placeholder: true },
      { party: "agency", version: 1, status: "current", placeholder: true },
    ]);
    const current = await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client");
    expect(current?.title).toContain("PLACEHOLDER");
    expect(current?.body).toContain("PLACEHOLDER");
  });

  it("never touches a party that already has terms, and writes nothing the second time", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual(["agency", "fynix"]);
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual([]);
    expect((await documents()).filter((row) => row.party === "client")).toEqual([{ party: "client", version: 1, status: "current", placeholder: false }]);
  });

  it("is a development tool, not an admin action: nothing is audited", async () => {
    await seedPlaceholderTerms(rig.dbs.owner.db);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});
