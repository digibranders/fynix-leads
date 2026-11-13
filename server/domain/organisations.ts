import { eq } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createOrganisationSchema, updateOrganisationSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/** What a service returns about an organisation: the reference that is safe to show, and the id the admin screens address it by. */
export interface OrganisationRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly kind: "fynix" | "client" | "agency";
  readonly name: string;
  readonly brandName: string | null;
  /** The supplier a partner agency works under. `null` for a client, a supplier and Fynix. */
  readonly parentOrgId: string | null;
  readonly status: "active" | "archived";
}

export const organisationColumns = {
  id: organisation.id,
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
  parentOrgId: organisation.parentOrgId,
  status: organisation.status,
};

async function loadEditable(tx: ScopedTransaction, id: string): Promise<OrganisationRecord> {
  const [row] = await tx.select(organisationColumns).from(organisation).where(eq(organisation.id, id)).limit(1).for("update");
  if (row === undefined) throw new DomainError("not-found", "There is no such organisation.");
  // The Fynix organisation is the admin's own. It is created by `pnpm admin:create` and nothing here changes or archives it.
  if (row.kind === "fynix") throw new DomainError("invalid-transition", "The Fynix organisation cannot be changed here.");
  return row;
}

/** Inserts a client or an agency with a generated reference (`ORG-` and four characters), retried when taken. Used by every service that creates an organisation, so they share one way to do it. */
export function insertOrganisation(
  tx: ScopedTransaction,
  randomBytes: RandomBytes,
  values: { readonly kind: "client" | "agency"; readonly name: string; readonly brandName: string | null; readonly parentOrgId: string | null },
): Promise<OrganisationRecord> {
  return insertWithPublicRef(tx, { prefix: "ORG", constraint: "organisation_public_ref_unique", randomBytes }, async (attempt, publicRef) => {
    const [row] = await attempt.insert(organisation).values({ publicRef, ...values }).returning(organisationColumns);
    if (row === undefined) throw new Error("The organisation insert returned no row");
    return row;
  });
}

/** Creates a client or an agency with no parent (an agency with no parent is a supplier). The reference is generated here and retried when it is taken. */
export async function createOrganisation(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: parsed.kind, name: parsed.name, brandName: parsed.brandName ?? null, parentOrgId: null });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/** Renames an organisation or changes a client's brand name. The brand copy on the client's campaigns follows (migration 0004). */
export async function updateOrganisation(deps: DomainDeps, actor: FynixActor, organisationId: string, input: unknown): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  const parsed = parseInput(updateOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (parsed.brandName !== undefined && before.kind !== "client") throw new DomainError("invalid-input", "Only a client has a brand name.");
    const [after] = await tx
      .update(organisation)
      .set({ ...(parsed.name === undefined ? {} : { name: parsed.name }), ...(parsed.brandName === undefined ? {} : { brandName: parsed.brandName }) })
      .where(eq(organisation.id, id))
      .returning(organisationColumns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({ action: "organisation.update", subject: { table: "organisation", id, ref: after.publicRef }, before: snapshotOrganisation(before), after: snapshotOrganisation(after) });
    return after;
  });
}

/**
 * Archives or restores an organisation: nothing is deleted (decision D8). An archived organisation takes no new invite and
 * no new campaign. It does not end its members' sessions: Fynix suspends people one by one (server/domain/members.ts).
 */
export async function setOrganisationStatus(deps: DomainDeps, actor: FynixActor, organisationId: string, status: "active" | "archived"): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (before.status === status) throw new DomainError("invalid-transition", `The organisation is already ${status}.`);
    const [after] = await tx.update(organisation).set({ status }).where(eq(organisation.id, id)).returning(organisationColumns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({
      action: status === "archived" ? "organisation.archive" : "organisation.restore",
      subject: { table: "organisation", id, ref: after.publicRef },
      before: snapshotOrganisation(before),
      after: snapshotOrganisation(after),
    });
    return after;
  });
}
