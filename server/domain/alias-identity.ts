import { and, desc, eq, sql } from "drizzle-orm";
import { generateVerificationCode, hashVerificationCode } from "@/lib/domain/alias-code";
import type { Database } from "@/server/db/pool";
import { aliasIdentity, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { createAliasIdentitySchema, verifyAliasCodeSchema } from "@/server/domain/inputs";
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
  readonly clientBrandName: string;
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
  clientBrandName: aliasIdentity.clientBrandName,
  displayName: aliasIdentity.displayName,
  jobTitle: aliasIdentity.jobTitle,
  aliasEmail: aliasIdentity.aliasEmail,
  verifiedAt: aliasIdentity.verifiedAt,
  status: aliasIdentity.status,
  createdAt: aliasIdentity.createdAt,
};

/**
 * Creates an alias identity for an agency or supplier member (spec v2 section 9.3).
 * Generates an unguessable public reference, an initial 6-digit verification code, and persists the record.
 */
export async function createAliasIdentity(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes" | "now">,
  actor: TenantActor,
  input: unknown,
): Promise<CreatedAliasIdentity> {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency and supplier members can create alias identities.");
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
              clientBrandName: parsed.clientBrandName,
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

      return {
        id: created.id,
        publicRef: created.publicRef,
        memberId: created.memberId,
        clientBrandName: created.clientBrandName,
        displayName: created.displayName,
        jobTitle: created.jobTitle,
        aliasEmail: created.aliasEmail,
        verifiedAt: created.verifiedAt,
        status: created.status,
        createdAt: created.createdAt,
      };
    } catch (error) {
      if (isUniqueViolation(error, "alias_identity_member_brand_email_unique")) {
        throw new DomainError("alias-taken", "An alias identity for that client brand and email already exists.");
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
    throw new DomainError("not-authorised", "Only agency and supplier members can verify alias identities.");
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
    return {
      id: row.id,
      publicRef: row.publicRef,
      memberId: row.memberId,
      clientBrandName: row.clientBrandName,
      displayName: row.displayName,
      jobTitle: row.jobTitle,
      aliasEmail: row.aliasEmail,
      verifiedAt: row.verifiedAt,
      status: row.status,
      createdAt: row.createdAt,
    };
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
