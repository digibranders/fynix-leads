import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { clientCollateral, clientProfile, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { addCollateralSchema, createOrganisationSchema, updateClientProfileSchema, updateOrganisationSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotCollateral, snapshotOrganisation, snapshotProfile } from "@/server/domain/snapshots";

/** What a service returns about an organisation: the reference that is safe to show, and the id the admin screens address it by. */
export interface OrganisationRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly kind: "fynix" | "client" | "agency";
  readonly name: string;
  /** The IANA zone the company works in; `null` until Fynix sets it. */
  readonly timeZone: string | null;
  /** The supplier a partner agency works under. `null` for a client, a supplier and Fynix. */
  readonly parentOrgId: string | null;
  readonly status: "active" | "archived";
}

export const organisationColumns = {
  id: organisation.id,
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  timeZone: organisation.timeZone,
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
  values: { readonly kind: "client" | "agency"; readonly name: string; readonly parentOrgId: string | null; readonly timeZone?: string | null },
): Promise<OrganisationRecord> {
  return insertWithPublicRef(tx, { prefix: "ORG", constraint: "organisation_public_ref_unique", randomBytes }, async (attempt, publicRef) => {
    const [row] = await attempt.insert(organisation).values({ publicRef, ...values }).returning(organisationColumns);
    if (row === undefined) throw new Error("The organisation insert returned no row");
    return row;
  });
}

/** What Fynix reads of a client's profile. */
export interface ClientProfileRecord {
  readonly clientOrgId: string;
  readonly introduction: string;
  readonly services: string;
  readonly differentiator: string;
  readonly caseStudies: string | null;
}

export interface CollateralRecord {
  readonly id: string;
  readonly clientOrgId: string;
  readonly kind: string;
  readonly title: string;
  readonly url: string | null;
  readonly createdAt: Date;
}

const profileColumns = {
  clientOrgId: clientProfile.clientOrgId,
  introduction: clientProfile.introduction,
  services: clientProfile.services,
  differentiator: clientProfile.differentiator,
  caseStudies: clientProfile.caseStudies,
};

const collateralColumns = {
  id: clientCollateral.id,
  clientOrgId: clientCollateral.clientOrgId,
  kind: clientCollateral.kind,
  title: clientCollateral.title,
  url: clientCollateral.url,
  createdAt: clientCollateral.createdAt,
};

/** Refuses a second company of the same kind with the same name, ignoring case and surrounding spaces, until the caller says it is on purpose. */
async function refuseDuplicateName(tx: ScopedTransaction, kind: "client" | "agency", companyName: string, confirmed: boolean | undefined): Promise<void> {
  if (confirmed === true) return;
  const [same] = await tx
    .select({ id: organisation.id })
    .from(organisation)
    .where(and(eq(organisation.kind, kind), sql`lower(btrim(${organisation.name})) = lower(${companyName})`))
    .limit(1);
  if (same !== undefined) throw new DomainError("duplicate-name", `A ${kind} with that name already exists.`);
}

async function upsertProfile(
  tx: ScopedTransaction,
  clientOrgId: string,
  values: { readonly introduction: string; readonly services: string; readonly differentiator: string; readonly caseStudies?: string | null | undefined },
  now: Date,
): Promise<{ readonly before: ClientProfileRecord | null; readonly after: ClientProfileRecord }> {
  const [before] = await tx.select(profileColumns).from(clientProfile).where(eq(clientProfile.clientOrgId, clientOrgId)).limit(1).for("update");
  const fields = { introduction: values.introduction, services: values.services, differentiator: values.differentiator, caseStudies: values.caseStudies ?? null };
  const [after] =
    before === undefined
      ? await tx.insert(clientProfile).values({ clientOrgId, ...fields }).returning(profileColumns)
      : await tx.update(clientProfile).set({ ...fields, updatedAt: now }).where(eq(clientProfile.clientOrgId, clientOrgId)).returning(profileColumns);
  if (after === undefined) throw new Error("The client profile write returned no row");
  return { before: before ?? null, after };
}

/**
 * Creates a client or an agency with no parent (an agency with no parent is a supplier). The reference is generated here and retried when it is
 * taken. A client has one name; its time zone and profile can be given here. A company with the same name (same kind, any case) is refused with `duplicate-name` unless `confirmDuplicate` is true.
 */
export async function createOrganisation(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    await refuseDuplicateName(tx, parsed.kind, parsed.name, parsed.confirmDuplicate);
    const created = await insertOrganisation(tx, deps.randomBytes, {
      kind: parsed.kind,
      name: parsed.name,
      parentOrgId: null,
      timeZone: parsed.timeZone ?? null,
    });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    if (parsed.profile !== undefined) {
      const { after } = await upsertProfile(tx, created.id, parsed.profile, deps.now());
      await audit({ action: "client_profile.update", subject: { table: "client_profile", id: created.id, ref: created.publicRef }, before: null, after: snapshotProfile(after) });
    }
    return created;
  });
}

/**
 * Renames an organisation or sets the time zone of either (`null` clears it). A client has one name: everyone who may see it sees the new name.
 */
export async function updateOrganisation(deps: DomainDeps, actor: FynixActor, organisationId: string, input: unknown): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  const parsed = parseInput(updateOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    const [after] = await tx
      .update(organisation)
      .set({
        ...(parsed.name === undefined ? {} : { name: parsed.name }),
        ...(parsed.timeZone === undefined ? {} : { timeZone: parsed.timeZone }),
      })
      .where(eq(organisation.id, id))
      .returning(organisationColumns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({ action: "organisation.update", subject: { table: "organisation", id, ref: after.publicRef }, before: snapshotOrganisation(before), after: snapshotOrganisation(after) });
    return after;
  });
}

async function requireClient(tx: ScopedTransaction, clientOrgId: string): Promise<OrganisationRecord> {
  const row = await loadEditable(tx, clientOrgId);
  if (row.kind !== "client") throw new DomainError("invalid-input", "Only a client has a profile.");
  return row;
}

/** Sets a client's profile, creating it the first time. Only a Fynix admin. */
export async function updateClientProfile(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ClientProfileRecord> {
  const parsed = parseInput(updateClientProfileSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const client = await requireClient(tx, parsed.clientOrgId);
    const { before, after } = await upsertProfile(tx, client.id, parsed, deps.now());
    await audit({ action: "client_profile.update", subject: { table: "client_profile", id: client.id, ref: client.publicRef }, before: before === null ? null : snapshotProfile(before), after: snapshotProfile(after) });
    return after;
  });
}

/** Adds a link to a client's collateral. Files are not accepted yet: they need the scanned upload route. */
export async function addCollateral(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<CollateralRecord> {
  const parsed = parseInput(addCollateralSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const client = await requireClient(tx, parsed.clientOrgId);
    const [created] = await tx.insert(clientCollateral).values({ clientOrgId: client.id, kind: parsed.kind, title: parsed.title, url: parsed.url }).returning(collateralColumns);
    if (created === undefined) throw new Error("The collateral insert returned no row");
    await audit({ action: "client_collateral.add", subject: { table: "client_collateral", id: created.id, ref: client.publicRef }, before: null, after: snapshotCollateral(created) });
    return created;
  });
}

/** Removes a piece of collateral from view. The row stays (nothing is deleted); the client and the agencies stop seeing it. */
export async function removeCollateral(deps: DomainDeps, actor: FynixActor, collateralId: string): Promise<void> {
  const id = parseInput(uuidSchema, collateralId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx.select({ ...collateralColumns, removedAt: clientCollateral.removedAt }).from(clientCollateral).where(eq(clientCollateral.id, id)).limit(1).for("update");
    if (row === undefined) throw new DomainError("not-found", "There is no such collateral.");
    if (row.removedAt !== null) throw new DomainError("invalid-transition", "That collateral is already removed.");
    await tx.update(clientCollateral).set({ removedAt: deps.now() }).where(eq(clientCollateral.id, id));
    await audit({ action: "client_collateral.remove", subject: { table: "client_collateral", id }, before: snapshotCollateral(row), after: null });
  });
}

/** A client's profile and its live collateral, for Fynix (staff included). Null profile when none has been taken yet. */
export async function readClientProfile(deps: DomainDeps, actor: FynixActor, clientOrgId: string): Promise<{ readonly profile: ClientProfileRecord | null; readonly collateral: readonly CollateralRecord[] }> {
  const id = parseInput(uuidSchema, clientOrgId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [profile] = await tx.select(profileColumns).from(clientProfile).where(eq(clientProfile.clientOrgId, id)).limit(1);
    const collateral = await tx.select(collateralColumns).from(clientCollateral).where(and(eq(clientCollateral.clientOrgId, id), isNull(clientCollateral.removedAt))).orderBy(asc(clientCollateral.createdAt));
    return { profile: profile ?? null, collateral };
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
