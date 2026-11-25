import { and, desc, eq, sql } from "drizzle-orm";
import { generateVerificationCode, hashVerificationCode } from "@/lib/domain/alias-code";
import { campaignClientName, clientNameOf } from "@/server/db/client-name";
import type { Database } from "@/server/db/pool";
import { aliasIdentity, campaign, member } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { createAliasIdentitySchema, retireAliasIdentitySchema, updateAliasIdentitySchema, verifyAliasCodeSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";

export interface TenantActor {
  readonly userId: string;
  readonly orgId: string;
  readonly orgKind: "client" | "agency";
  readonly role: "member" | "manager";
}

export interface AliasIdentityRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly memberId: string;
  /** The client's name, read through `app_client_name`; empty while the alias has no client. */
  readonly clientName: string;
  /** The client the alias is for; null only on an alias made before phase 2 that the backfill of migration 0078 could not match. */
  readonly clientOrgId: string | null;
  readonly displayName: string;
  readonly jobTitle: string;
  readonly aliasEmail: string;
  readonly verifiedAt: Date | null;
  readonly status: string;
  readonly createdAt: Date;
}

export type CreatedAliasIdentity = AliasIdentityRecord;

export const aliasIdentityColumns = {
  id: aliasIdentity.id,
  publicRef: aliasIdentity.publicRef,
  memberId: aliasIdentity.memberId,
  clientName: clientNameOf(aliasIdentity.clientOrgId),
  clientOrgId: aliasIdentity.clientOrgId,
  displayName: aliasIdentity.displayName,
  jobTitle: aliasIdentity.jobTitle,
  aliasEmail: aliasIdentity.aliasEmail,
  verifiedAt: aliasIdentity.verifiedAt,
  status: aliasIdentity.status,
  createdAt: aliasIdentity.createdAt,
};

export interface AliasClient {
  readonly id: string;
  /** The client's name. */
  readonly name: string;
}

/** The clients of the campaigns an agency or coordinator sees, by name: the list an alias picks its client from. Campaign status does not matter. */
export async function listAliasClients(db: Database, actor: TenantActor): Promise<readonly AliasClient[]> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency and coordinator members have aliases.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx.select({ id: campaign.clientOrgId, name: campaignClientName(campaign.id) }).from(campaign);
    const byId = new Map(rows.map((row) => [row.id, row.name]));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Refuses any client the organisation does not serve with `invalid-input`, so the person gets a plain refusal before the database's. */
async function assertClientServed(tx: ScopedTransaction, clientOrgId: string): Promise<void> {
  const [row] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.clientOrgId, clientOrgId)).limit(1);
  if (row === undefined) throw new DomainError("invalid-input", "Choose a client of one of your campaigns.");
}

/**
 * Creates an alias identity for an agency or coordinator member (spec v2 section 9.3). The client is picked from the clients of the campaigns the
 * organisation sees (`listAliasClients`); the database refuses any other (trigger `alias_identity_set_client`, migration 0064). Generates an unguessable public reference and an initial 6-digit
 * verification code, and persists the record.
 */
export async function createAliasIdentity(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes" | "now">,
  actor: TenantActor,
  input: unknown,
): Promise<CreatedAliasIdentity> {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency and coordinator members can create alias identities.");
  }
  const parsed = parseInput(createAliasIdentitySchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [currentMember] = await tx
      .select({ id: member.id, status: member.status })
      .from(member)
      .where(and(eq(member.userId, actor.userId), eq(member.orgId, actor.orgId)))
      .limit(1);

    if (currentMember === undefined || currentMember.status !== "active") {
      throw new DomainError("not-authorised", "The signed-in user is not an active agency member.");
    }

    await assertClientServed(tx, parsed.clientOrgId);
    const { code, codeHash } = generateVerificationCode(deps.randomBytes);

    try {
      const created = await insertWithPublicRef(
        tx,
        { prefix: "ALI", constraint: "alias_identity_public_ref_unique", randomBytes: deps.randomBytes },
        async (innerTx, ref) => {
          const [row] = await innerTx
            .insert(aliasIdentity)
            .values({
              publicRef: ref,
              memberId: currentMember.id,
              clientOrgId: parsed.clientOrgId,
              displayName: parsed.displayName,
              jobTitle: parsed.jobTitle,
              aliasEmail: parsed.aliasEmail,
              verificationCodeHash: codeHash,
              verificationSentAt: deps.now(),
            })
            .returning(aliasIdentityColumns);
          return row;
        },
      );

      if (created === undefined) throw new Error("Insert of alias_identity returned no row");

      // The code goes to the alias mailbox only (migration 0046); it is never handed back to the person who is verifying.
      await tx.execute(sql`select public.app_queue_alias_code_mail(${created.publicRef}, ${code})`);

      return created;
    } catch (error) {
      if (isUniqueViolation(error, "alias_identity_member_brand_email_unique")) {
        throw new DomainError("alias-taken", "An alias identity for that client and email already exists.");
      }
      throw error;
    }
  });
}

/**
 * Verifies an alias identity using the 6-digit code sent to the mailbox.
 */
export async function verifyAliasCode(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
): Promise<AliasIdentityRecord> {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency and coordinator members can verify alias identities.");
  }
  const parsed = parseInput(verifyAliasCodeSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // The code is checked inside the database (migration 0044): the hash is not readable to this role.
    const result = await tx.execute<{ outcome: string }>(
      sql`select public.app_verify_alias_code(${parsed.publicRef}, ${hashVerificationCode(parsed.code)}) as outcome`,
    );
    const outcome = result.rows[0]?.outcome;
    if (outcome === "missing" || outcome === undefined) {
      throw new DomainError("not-found", "There is no such alias identity.");
    }
    if (outcome === "wrong") {
      throw new DomainError("invalid-code", "The verification code is incorrect.");
    }

    const [row] = await tx.select(aliasIdentityColumns).from(aliasIdentity).where(eq(aliasIdentity.publicRef, parsed.publicRef)).limit(1);
    if (row === undefined) throw new Error("The alias identity vanished after it was verified");
    return row;
  });
}

/**
 * Lists alias identities owned by the actor's organisation.
 */
export async function listAliasIdentities(db: Database, actor: TenantActor): Promise<readonly AliasIdentityRecord[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select(aliasIdentityColumns)
      .from(aliasIdentity)
      .orderBy(desc(aliasIdentity.createdAt));

    return rows;
  });
}

/**
 * Changes an alias's client, display name or title. The mailbox is fixed: a new one would need a new code. Only the organisation's own aliases
 * are found; a retired alias cannot be edited.
 */
export async function updateAliasIdentity(db: Database, actor: TenantActor, input: unknown): Promise<AliasIdentityRecord> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency and coordinator members can edit alias identities.");
  const parsed = parseInput(updateAliasIdentitySchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [existing] = await tx.select(aliasIdentityColumns).from(aliasIdentity).where(eq(aliasIdentity.publicRef, parsed.publicRef)).limit(1);
    if (existing === undefined) throw new DomainError("not-found", "There is no such alias identity.");
    if (existing.status !== "active") throw new DomainError("invalid-transition", "A retired alias cannot be edited.");
    if (parsed.clientOrgId !== undefined) await assertClientServed(tx, parsed.clientOrgId);
    try {
      const [updated] = await tx
        .update(aliasIdentity)
        .set({
          ...(parsed.clientOrgId === undefined ? {} : { clientOrgId: parsed.clientOrgId }),
          ...(parsed.displayName === undefined ? {} : { displayName: parsed.displayName }),
          ...(parsed.jobTitle === undefined ? {} : { jobTitle: parsed.jobTitle }),
          updatedAt: new Date(),
        })
        .where(eq(aliasIdentity.id, existing.id))
        .returning(aliasIdentityColumns);
      if (updated === undefined) throw new Error("The alias update returned no row");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error, "alias_identity_member_brand_email_unique")) throw new DomainError("alias-taken", "An alias identity for that client and email already exists.");
      throw error;
    }
  });
}

/** Retires an alias: it stays on the leads it fronted but can front no new one. Nothing is deleted. */
export async function retireAliasIdentity(db: Database, actor: TenantActor, input: unknown): Promise<AliasIdentityRecord> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency and coordinator members can retire alias identities.");
  const parsed = parseInput(retireAliasIdentitySchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [existing] = await tx.select(aliasIdentityColumns).from(aliasIdentity).where(eq(aliasIdentity.publicRef, parsed.publicRef)).limit(1);
    if (existing === undefined) throw new DomainError("not-found", "There is no such alias identity.");
    if (existing.status !== "active") throw new DomainError("invalid-transition", "That alias is retired already.");
    const [updated] = await tx.update(aliasIdentity).set({ status: "archived", updatedAt: new Date() }).where(eq(aliasIdentity.id, existing.id)).returning(aliasIdentityColumns);
    if (updated === undefined) throw new Error("The alias update returned no row");
    return updated;
  });
}
