import { asc, eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { organisation } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createPartnerAgencySchema, createSupplierPartnerAgencySchema, createSupplierSchema } from "@/server/domain/inputs";
import { insertOrganisation, organisationColumns, type OrganisationRecord } from "@/server/domain/organisations";
import { parseInput } from "@/server/domain/parse";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/**
 * The supply side (spec 2 and 6): a **supplier** is an agency with no parent, a **partner agency** is an agency whose parent is
 * a supplier, and there are two levels at most. The database enforces all of it (migrations 0019, 0020 and 0024); these
 * functions say it in words first. Both creates are Fynix admin writes and audit as `organisation.create`.
 */

/** A supplier with the partner agencies that work under it. */
export interface SupplierRecord {
  readonly supplier: OrganisationRecord;
  readonly agencies: readonly OrganisationRecord[];
}

/** Creates a supplier: an agency with no parent. A supplier who works alone has no partner agencies and its own users submit the leads. */
export async function createSupplier(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createSupplierSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, brandName: null, parentOrgId: null });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/**
 * Creates a partner agency under a supplier. The supplier must exist, be an agency with no parent, and be active. It is read
 * `FOR SHARE`, so a concurrent change that would give it a parent waits (the database repeats the rule, migration 0020).
 */
export async function createPartnerAgency(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createPartnerAgencySchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [supplier] = await tx.select(organisationColumns).from(organisation).where(eq(organisation.id, parsed.supplierId)).limit(1).for("share");
    if (supplier === undefined) throw new DomainError("not-found", "There is no such supplier.");
    if (supplier.kind !== "agency" || supplier.parentOrgId !== null) throw new DomainError("not-a-supplier", "A partner agency works under a supplier: an agency with no parent.");
    if (supplier.status !== "active") throw new DomainError("organisation-archived", "The supplier is archived.");
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, brandName: null, parentOrgId: supplier.id });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/** Every supplier by name, archived ones included (their status says so), each with its partner agencies by name. Open to Fynix staff. */
export async function listSuppliers(deps: DomainDeps, actor: FynixActor): Promise<readonly SupplierRecord[]> {
  const agencies = await fynixRead(deps.fynixDb, actor, (tx) => tx.select(organisationColumns).from(organisation).where(eq(organisation.kind, "agency")).orderBy(asc(organisation.name)));
  const partners = new Map<string, OrganisationRecord[]>();
  for (const row of agencies) {
    if (row.parentOrgId !== null) partners.set(row.parentOrgId, [...(partners.get(row.parentOrgId) ?? []), row]);
  }
  return agencies.filter((row) => row.parentOrgId === null).map((supplier) => ({ supplier, agencies: partners.get(supplier.id) ?? [] }));
}

/**
 * Creates a partner agency under a supplier by the supplier's own manager.
 * Uses the supplier's own orgId as parentOrgId, enforced by Postgres RLS.
 */
export async function createPartnerAgencyBySupplier(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes">,
  actor: { readonly userId: string; readonly orgId: string; readonly role: "member" | "manager" },
  input: unknown,
): Promise<OrganisationRecord> {
  if (actor.role !== "manager") {
    throw new DomainError("not-authorised", "Only a supplier manager can create partner agencies.");
  }
  const parsed = parseInput(createSupplierPartnerAgencySchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const created = await insertOrganisation(tx, deps.randomBytes, {
      kind: "agency",
      name: parsed.name,
      brandName: null,
      parentOrgId: actor.orgId,
    });
    return created;
  });
}
