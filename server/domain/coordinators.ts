import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { organisation } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createPartnerAgencySchema, createCoordinatorPartnerAgencySchema, createCoordinatorSchema, firstPersonSchema } from "@/server/domain/inputs";
import { issueInvite } from "@/server/domain/invites";
import { contactValues, insertOrganisation, organisationColumns, type OrganisationRecord } from "@/server/domain/organisations";
import { parseInput } from "@/server/domain/parse";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/**
 * The supply side (spec 2 and 6): a **coordinator** is an agency with no parent, a **partner agency** is an agency whose parent is
 * a coordinator, and there are two levels at most. The database enforces all of it (migrations 0019, 0020 and 0024); these
 * functions say it in words first. Both creates are Fynix admin writes and audit as `organisation.create`.
 */

/** A coordinator with the partner agencies that work under it. */
export interface CoordinatorRecord {
  readonly coordinator: OrganisationRecord;
  readonly agencies: readonly OrganisationRecord[];
}

/** Refuses a second agency of the same level (all coordinators, or the partner agencies of one coordinator) with the same name, ignoring case and surrounding spaces, until the caller says it is on purpose. */
async function refuseDuplicateAgency(tx: ScopedTransaction, parentOrgId: string | null, companyName: string, confirmed: boolean | undefined): Promise<void> {
  if (confirmed === true) return;
  const [same] = await tx
    .select({ id: organisation.id })
    .from(organisation)
    .where(and(eq(organisation.kind, "agency"), parentOrgId === null ? isNull(organisation.parentOrgId) : eq(organisation.parentOrgId, parentOrgId), sql`lower(btrim(${organisation.name})) = lower(${companyName})`))
    .limit(1);
  if (same !== undefined) throw new DomainError("duplicate-name", parentOrgId === null ? "A coordinator with that name already exists." : "That coordinator already has an agency with that name.");
}

/** Creates a coordinator: an agency with no parent. A coordinator who works alone has no partner agencies and its own users submit the leads. A coordinator of the same name (any case) is refused with `duplicate-name` unless `confirmDuplicate` is true. */
export async function createCoordinator(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createCoordinatorSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    await refuseDuplicateAgency(tx, null, parsed.name, parsed.confirmDuplicate);
    const contact = contactValues(parsed);
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, parentOrgId: null, timeZone: parsed.timeZone ?? null, ...contact });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created, contact) });
    return created;
  });
}

/**
 * Creates a partner agency under a coordinator. The coordinator must exist, be an agency with no parent, and be active. It is read
 * `FOR SHARE`, so a concurrent change that would give it a parent waits (the database repeats the rule, migration 0020).
 */
export async function createPartnerAgency(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createPartnerAgencySchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [coordinator] = await tx.select(organisationColumns).from(organisation).where(eq(organisation.id, parsed.coordinatorId)).limit(1).for("share");
    if (coordinator === undefined) throw new DomainError("not-found", "There is no such coordinator.");
    if (coordinator.kind !== "agency" || coordinator.parentOrgId !== null) throw new DomainError("not-a-coordinator", "A partner agency works under a coordinator: an agency with no parent.");
    if (coordinator.status !== "active") throw new DomainError("organisation-archived", "The coordinator is archived.");
    await refuseDuplicateAgency(tx, coordinator.id, parsed.name, parsed.confirmDuplicate);
    const contact = contactValues(parsed);
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, parentOrgId: coordinator.id, timeZone: parsed.timeZone ?? null, ...contact });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created, contact) });
    return created;
  });
}

/** What became of the first person's invite: not asked for, queued, or refused (`code` is the reason, `null` for a fault). */
export type FirstInvite = { readonly status: "none" } | { readonly status: "sent" } | { readonly status: "failed"; readonly code: DomainErrorCode | null };

/** A new coordinator or agency and what became of its first person's invite. */
export interface CreatedWithFirstPerson {
  readonly organisation: OrganisationRecord;
  readonly firstInvite: FirstInvite;
}

/**
 * The invite goes in its own transaction after the organisation is saved, so a refusal (no terms published, an address that already has an
 * account) leaves the organisation in place and says why. The person's details are checked before anything is written.
 */
async function inviteFirstPerson(deps: DomainDeps, actor: FynixActor, organisationId: string, firstPerson: unknown): Promise<FirstInvite> {
  try {
    await issueInvite(deps, actor, { ...parseInput(firstPersonSchema, firstPerson), organisationId });
    return { status: "sent" };
  } catch (error) {
    if (error instanceof DomainError) return { status: "failed", code: error.code };
    // A domain file never logs (server/domain/boundaries.test.ts); a fault is reported to the caller as a failure with no reason.
    return { status: "failed", code: null };
  }
}

/** `createCoordinator`, then (when `firstPerson` is given) the invite of its first manager or member. */
export async function createCoordinatorWithFirstPerson(deps: DomainDeps, actor: FynixActor, input: unknown, firstPerson?: unknown): Promise<CreatedWithFirstPerson> {
  if (firstPerson !== undefined) parseInput(firstPersonSchema, firstPerson);
  const organisation = await createCoordinator(deps, actor, input);
  return { organisation, firstInvite: firstPerson === undefined ? { status: "none" } : await inviteFirstPerson(deps, actor, organisation.id, firstPerson) };
}

/** `createPartnerAgency`, then (when `firstPerson` is given) the invite of its first person into the new agency. */
export async function createPartnerAgencyWithFirstPerson(deps: DomainDeps, actor: FynixActor, input: unknown, firstPerson?: unknown): Promise<CreatedWithFirstPerson> {
  if (firstPerson !== undefined) parseInput(firstPersonSchema, firstPerson);
  const organisation = await createPartnerAgency(deps, actor, input);
  return { organisation, firstInvite: firstPerson === undefined ? { status: "none" } : await inviteFirstPerson(deps, actor, organisation.id, firstPerson) };
}

/** Every coordinator by name, archived ones included (their status says so), each with its partner agencies by name. Open to Fynix staff. */
export async function listCoordinators(deps: DomainDeps, actor: FynixActor): Promise<readonly CoordinatorRecord[]> {
  const agencies = await fynixRead(deps.fynixDb, actor, (tx) => tx.select(organisationColumns).from(organisation).where(eq(organisation.kind, "agency")).orderBy(asc(organisation.name)));
  const partners = new Map<string, OrganisationRecord[]>();
  for (const row of agencies) {
    if (row.parentOrgId !== null) partners.set(row.parentOrgId, [...(partners.get(row.parentOrgId) ?? []), row]);
  }
  return agencies.filter((row) => row.parentOrgId === null).map((coordinator) => ({ coordinator, agencies: partners.get(coordinator.id) ?? [] }));
}

/**
 * Creates a partner agency under a coordinator by the coordinator's own manager.
 * Uses the coordinator's own orgId as parentOrgId, enforced by Postgres RLS.
 */
export async function createPartnerAgencyByCoordinator(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes">,
  actor: { readonly userId: string; readonly orgId: string; readonly role: "member" | "manager" },
  input: unknown,
): Promise<OrganisationRecord> {
  if (actor.role !== "manager") {
    throw new DomainError("not-authorised", "Only a coordinator manager can create partner agencies.");
  }
  const parsed = parseInput(createCoordinatorPartnerAgencySchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const created = await insertOrganisation(tx, deps.randomBytes, {
      kind: "agency",
      name: parsed.name,
      parentOrgId: actor.orgId,
    });
    return created;
  });
}
