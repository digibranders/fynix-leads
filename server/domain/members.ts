import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { member, agencyAlias } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { requireFreeAlias } from "@/server/domain/aliases";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { aliasSchema, displayNameSchema, memberDetailsSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotMember } from "@/server/domain/snapshots";

export interface MemberRecord {
  readonly id: string;
  readonly userId: string;
  readonly orgId: string;
  readonly orgKind: "fynix" | "client" | "agency";
  readonly role: "member" | "manager";
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly status: "active" | "suspended";
}

const columns = {
  id: member.id,
  userId: member.userId,
  orgId: member.orgId,
  orgKind: member.orgKind,
  role: member.role,
  displayName: member.displayName,
  jobTitle: member.jobTitle,
  phone: member.phone,
  status: member.status,
};

async function loadForUpdate(tx: ScopedTransaction, id: string): Promise<MemberRecord> {
  const [row] = await tx.select(columns).from(member).where(eq(member.id, id)).limit(1).for("update");
  if (row === undefined) throw new DomainError("not-found", "There is no such member.");
  return row;
}

async function setStatus(deps: DomainDeps, actor: FynixActor, memberId: string, status: "active" | "suspended"): Promise<MemberRecord> {
  const id = parseInput(uuidSchema, memberId);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadForUpdate(tx, id);
    if (status === "suspended" && before.userId === actor.userId) throw new DomainError("cannot-suspend-self", "An admin cannot suspend their own membership.");
    if (before.status === status) throw new DomainError("invalid-transition", `The member is already ${status}.`);
    const [after] = await tx.update(member).set({ status }).where(eq(member.id, id)).returning(columns);
    if (after === undefined) throw new Error("The member update returned no row");
    await audit({ action: status === "suspended" ? "member.suspend" : "member.reactivate", subject: { table: "member", id }, before: snapshotMember(before), after: snapshotMember(after) });
    return after;
  });
}

/**
 * Suspends a member. They get no new session, and the sessions they hold stop resolving on the very next request, because
 * session resolution reads `member.status` every time (phase 1B, decision B4). Nothing is deleted. An admin cannot suspend
 * themselves: with one admin that would lock everyone out.
 */
export function suspendMember(deps: DomainDeps, actor: FynixActor, memberId: string): Promise<MemberRecord> {
  return setStatus(deps, actor, memberId, "suspended");
}

/** Reactivates a suspended member. Their old sessions work again until they end, and they can sign in. */
export function reactivateMember(deps: DomainDeps, actor: FynixActor, memberId: string): Promise<MemberRecord> {
  return setStatus(deps, actor, memberId, "active");
}

/** Changes the name other people in the organisation see. The name on the account (`user.name`) is not touched. */
export async function renameMember(deps: DomainDeps, actor: FynixActor, memberId: string, displayName: string): Promise<MemberRecord> {
  const id = parseInput(uuidSchema, memberId);
  const name = parseInput(displayNameSchema, displayName);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadForUpdate(tx, id);
    const [after] = await tx.update(member).set({ displayName: name }).where(eq(member.id, id)).returning(columns);
    if (after === undefined) throw new Error("The member update returned no row");
    await audit({ action: "member.rename", subject: { table: "member", id }, before: snapshotMember(before), after: snapshotMember(after) });
    return after;
  });
}

/**
 * Gives an agency member the Fynix alias the client sees, or changes it. The alias must be free (another member's, or a live
 * invite's, is a clash). Aliases already copied onto records the client reads are not rewritten (phase 2 stores a copy).
 */
export async function setAgencyAlias(deps: DomainDeps, actor: FynixActor, memberId: string, alias: string): Promise<{ readonly alias: string }> {
  const id = parseInput(uuidSchema, memberId);
  const text = parseInput(aliasSchema, alias);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadForUpdate(tx, id);
    if (row.orgKind !== "agency") throw new DomainError("invalid-input", "Only an agency member has an alias.");
    await requireFreeAlias(tx, text, id);
    const [existing] = await tx.select({ id: agencyAlias.id, alias: agencyAlias.alias }).from(agencyAlias).where(eq(agencyAlias.memberId, id)).limit(1);
    let subjectId: string;
    try {
      if (existing === undefined) {
        const [created] = await tx.insert(agencyAlias).values({ memberId: id, alias: text }).returning({ id: agencyAlias.id });
        if (created === undefined) throw new Error("The alias insert returned no row");
        subjectId = created.id;
      } else {
        await tx.update(agencyAlias).set({ alias: text, updatedAt: deps.now() }).where(eq(agencyAlias.id, existing.id));
        subjectId = existing.id;
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError("alias-taken", "Another person already has that alias.");
      throw error;
    }
    await audit({ action: "agency_alias.set", subject: { table: "agency_alias", id: subjectId }, before: existing === undefined ? null : { memberId: id, alias: existing.alias }, after: { memberId: id, alias: text } });
    return { alias: text };
  });
}

/**
 * Changes a person's name, job title or phone (`null` clears the phone). A Fynix admin does it for anyone; the job title is required
 * wherever it is given, as at invite. Staff are refused (`admin-required`).
 */
export async function updateMemberDetails(deps: DomainDeps, actor: FynixActor, memberId: string, input: unknown): Promise<MemberRecord> {
  const id = parseInput(uuidSchema, memberId);
  const parsed = parseInput(memberDetailsSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadForUpdate(tx, id);
    const [after] = await tx.update(member).set(detailValues(parsed)).where(eq(member.id, id)).returning(columns);
    if (after === undefined) throw new Error("The member update returned no row");
    await audit({ action: "member.update_details", subject: { table: "member", id }, before: snapshotMember(before), after: snapshotMember(after) });
    return after;
  });
}

function detailValues(parsed: { readonly displayName?: string | undefined; readonly jobTitle?: string | undefined; readonly phone?: string | null | undefined }) {
  return {
    ...(parsed.displayName === undefined ? {} : { displayName: parsed.displayName }),
    ...(parsed.jobTitle === undefined ? {} : { jobTitle: parsed.jobTitle }),
    ...(parsed.phone === undefined ? {} : { phone: parsed.phone }),
  };
}

/**
 * A client manager changes the name, job title or phone of a person in their own client. `db` is the `leads_client` pool. The database repeats
 * the rule (migration 0059): only an active manager, only rows of their own organisation, only those three columns. No audit row (Fynix writes only).
 * A person of another organisation is `not-found`, whatever the id.
 */
export async function updateOwnMemberDetails(db: Database, actor: TenantActor, memberId: string, input: unknown): Promise<void> {
  const id = parseInput(uuidSchema, memberId);
  const parsed = parseInput(memberDetailsSchema, input);
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a client manager edits its people here.");
  if (actor.role !== "manager") throw new DomainError("not-authorised", "Only a manager can change a person's details.");
  await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const updated = await tx.update(member).set(detailValues(parsed)).where(eq(member.id, id)).returning({ id: member.id });
    if (updated.length === 0) throw new DomainError("not-found", "There is no such member.");
  });
}
