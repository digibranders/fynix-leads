import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { agreement, agreementAcceptance, campaign, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { assertCampaignOpen } from "@/server/domain/campaign-rules";
import { acceptTenantAgreementSchema, publishAgreementSchema, recordAgreementAcceptanceSchema, uuidSchema } from "@/server/domain/inputs";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";
import { snapshotAcceptance, snapshotAgreement } from "@/server/domain/snapshots";

/**
 * The virtual agreement (spec 7.2, phase 2): ONE agreement per campaign, with one monthly and one total number, accepted by the client and by
 * the coordinator. It is stored as the `client` party row; rows with party `supplier` from before phase 2 are left alone and never read.
 * Each change is a new version; a published version is never edited, only superseded; every version and every acceptance is kept. The old
 * version stays in force until both sides have accepted the new one: the database copies a version's numbers onto the campaign when its
 * second side accepts (migration 0064). `publishAgreement` and `recordAgreementAcceptance` are Fynix admin writes; `readAgreements` is open to staff.
 */

/** Which side of the agreement a signer is on: the client, or the coordinator (the campaign's supplier). */
export type AgreementSide = "client" | "supplier";

export interface AcceptanceRecord {
  readonly side: AgreementSide;
  readonly userId: string;
  readonly acceptedAt: Date;
  readonly networkAddress: string;
}

export interface AgreementRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly party: "client" | "supplier";
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
  readonly status: "current" | "superseded";
  readonly createdAt: Date;
  readonly acceptances: readonly AcceptanceRecord[];
}

/** A campaign's agreement: the newest version, the ones it replaced (newest first) and the version in force (the newest one both sides accepted). */
export interface AgreementHistory {
  readonly current: AgreementRecord | null;
  readonly history: readonly AgreementRecord[];
  readonly inForce: AgreementRecord | null;
}

/** True when the version has an acceptance from each side. */
export const acceptedByBothSides = (record: Pick<AgreementRecord, "acceptances">): boolean =>
  record.acceptances.some((entry) => entry.side === "client") && record.acceptances.some((entry) => entry.side === "supplier");

const agreementColumns = {
  id: agreement.id,
  campaignId: agreement.campaignId,
  party: agreement.party,
  version: agreement.version,
  monthlyTarget: agreement.monthlyTarget,
  totalTarget: agreement.totalTarget,
  disputeWindowHours: agreement.disputeWindowHours,
  rules: agreement.rules,
  notes: agreement.notes,
  status: agreement.status,
  createdAt: agreement.createdAt,
};

/**
 * Publishes the next version of a campaign's agreement (one set of numbers for the client and the coordinator), and supersedes the current one
 * in the same transaction. A closed campaign is refused with `campaign-closed`. The campaign row is locked first, so two admins publishing at once take turns and the second sees
 * the first's version. The author is the admin's own `member` row.
 */
export async function publishAgreement(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AgreementRecord> {
  const parsed = parseInput(publishAgreementSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit, actorMemberId }) => {
    const [target] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef, status: campaign.status }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    assertCampaignOpen(target.status);
    const [latest] = await tx
      .select(agreementColumns)
      .from(agreement)
      .where(and(eq(agreement.campaignId, target.id), eq(agreement.party, "client")))
      .orderBy(desc(agreement.version))
      .limit(1);
    // The database allows one current version per campaign and party and does not defer the check, so the old one goes first.
    if (latest?.status === "current") await tx.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, latest.id));
    const [created] = await tx
      .insert(agreement)
      .values({
        campaignId: target.id,
        party: "client",
        version: (latest?.version ?? 0) + 1,
        monthlyTarget: parsed.monthlyTarget,
        totalTarget: parsed.totalTarget,
        disputeWindowHours: parsed.disputeWindowHours,
        rules: parsed.rules,
        notes: parsed.notes,
        createdBy: actorMemberId,
      })
      .returning(agreementColumns);
    if (created === undefined) throw new Error("The agreement insert returned no row");
    await audit({
      action: "agreement.publish",
      subject: { table: "agreement", id: created.id, ref: `${target.publicRef} client v${created.version}` },
      before: latest === undefined ? null : snapshotAgreement(latest),
      after: snapshotAgreement(created),
    });
    await notify(tx, { type: "agreement_published", version: created.version, campaignId: target.id });
    return { ...created, acceptances: [] };
  });
}

/** A campaign's agreement: every version with who accepted it, and which one is in force. Open to Fynix staff. */
export async function readAgreements(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<AgreementHistory> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const rows = await tx.select(agreementColumns).from(agreement).where(and(eq(agreement.campaignId, id), eq(agreement.party, "client"))).orderBy(desc(agreement.version));
    const accepted =
      rows.length === 0
        ? []
        : await tx
            .select({ agreementId: agreementAcceptance.agreementId, side: agreementAcceptance.side, userId: agreementAcceptance.userId, acceptedAt: agreementAcceptance.acceptedAt, networkAddress: agreementAcceptance.networkAddress })
            .from(agreementAcceptance)
            .where(inArray(agreementAcceptance.agreementId, rows.map((row) => row.id)))
            .orderBy(asc(agreementAcceptance.acceptedAt));
    const records = rows.map(
      (row): AgreementRecord => ({
        ...row,
        acceptances: accepted.filter((entry) => entry.agreementId === row.id).map(({ side, userId, acceptedAt, networkAddress }) => ({ side: side as AgreementSide, userId, acceptedAt, networkAddress })),
      }),
    );
    return {
      current: records.find((row) => row.status === "current") ?? null,
      history: records.filter((row) => row.status === "superseded"),
      inForce: records.find(acceptedByBothSides) ?? null,
    };
  });
}

/**
 * Records that a user accepted the current version of the campaign agreement. A Fynix admin records it for the signer. The signer must be an
 * active manager of the campaign's client (the `client` side) or of its coordinator (the `supplier` side); the side comes from the signer's
 * organisation, never from input. A superseded version cannot be accepted (the next version asks again), a closed campaign refuses with
 * `campaign-closed`, and nobody accepts the same version twice. The agreement row is read `FOR SHARE`, so a version cannot be superseded
 * in the middle of its own acceptance.
 */
export async function recordAgreementAcceptance(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AcceptanceRecord & { readonly agreementId: string }> {
  const parsed = parseInput(recordAgreementAcceptanceSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx
      .select({ id: agreement.id, party: agreement.party, version: agreement.version, status: agreement.status, clientOrgId: campaign.clientOrgId, supplierOrgId: campaign.agencyOrgId, campaignRef: campaign.publicRef, campaignStatus: campaign.status })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(eq(agreement.id, parsed.agreementId))
      .limit(1)
      .for("share", { of: agreement });
    if (target === undefined) throw new DomainError("not-found", "There is no such agreement.");
    if (target.party !== "client") throw new DomainError("agreement-unused", "That agreement belongs to the old coordinator agreement, which is no longer used.");
    assertCampaignOpen(target.campaignStatus);
    if (target.status !== "current") throw new DomainError("agreement-superseded", "That version has been replaced. The current version is the one to accept.");
    const [signer] = await tx.select({ orgId: member.orgId, role: member.role, status: member.status }).from(member).where(eq(member.userId, parsed.userId)).limit(1);
    const side: AgreementSide | null = signer === undefined ? null : signer.orgId === target.clientOrgId ? "client" : signer.orgId === target.supplierOrgId ? "supplier" : null;
    if (signer === undefined || side === null || signer.role !== "manager" || signer.status !== "active") {
      throw new DomainError("not-an-agreement-signer", "An agreement is accepted by an active manager of the campaign's client or of its coordinator.");
    }
    let rows: { readonly id: string; readonly acceptedAt: Date }[];
    try {
      rows = await tx.insert(agreementAcceptance).values({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress, side }).returning({ id: agreementAcceptance.id, acceptedAt: agreementAcceptance.acceptedAt });
    } catch (error) {
      if (isUniqueViolation(error, "agreement_acceptance_agreement_user_unique")) throw new DomainError("already-accepted", "That person has accepted this version already.");
      throw error;
    }
    const created = rows[0];
    if (created === undefined) throw new Error("The acceptance insert returned no row");
    await audit({
      action: "agreement.accept",
      subject: { table: "agreement_acceptance", id: created.id, ref: `${target.campaignRef} ${side} v${target.version}` },
      before: null,
      after: { ...snapshotAcceptance({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress }), side },
    });
    return { agreementId: target.id, side, userId: parsed.userId, acceptedAt: created.acceptedAt, networkAddress: parsed.networkAddress };
  });
}

/**
 * Accepts the campaign agreement for a tenant manager's own side: a client manager accepts for the client, a coordinator manager for the
 * coordinator (`actor.orgKind`). Runs within tenant scope on leads_client or leads_agency, gated by database RLS. A closed campaign refuses
 * with `campaign-closed`.
 */
export async function acceptAgreementByTenant(
  db: Database,
  _deps: Pick<DomainDeps, "now">,
  actor: { readonly userId: string; readonly orgId: string; readonly orgKind: "client" | "agency"; readonly role: "member" | "manager" },
  input: unknown,
  networkAddress: string,
): Promise<AcceptanceRecord & { readonly agreementId: string }> {
  if (actor.role !== "manager") {
    throw new DomainError("not-authorised", "Only an organisation manager can accept an agreement.");
  }
  const parsed = parseInput(acceptTenantAgreementSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [target] = await tx
      .select({
        id: agreement.id,
        party: agreement.party,
        version: agreement.version,
        status: agreement.status,
        campaignStatus: campaign.status,
      })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(and(eq(agreement.id, parsed.agreementId), eq(agreement.party, "client")))
      .limit(1);

    if (target === undefined) {
      throw new DomainError("not-found", "There is no such agreement.");
    }
    assertCampaignOpen(target.campaignStatus);
    if (target.status !== "current") {
      throw new DomainError("agreement-superseded", "That version has been replaced. The current version is the one to accept.");
    }

    try {
      const [created] = await tx
        .insert(agreementAcceptance)
        .values({
          agreementId: target.id,
          userId: actor.userId,
          networkAddress,
          side: actor.orgKind === "client" ? "client" : "supplier",
        })
        .returning({
          id: agreementAcceptance.id,
          acceptedAt: agreementAcceptance.acceptedAt,
        });

      if (created === undefined) throw new Error("The acceptance insert returned no row");

      return {
        agreementId: target.id,
        side: actor.orgKind === "client" ? "client" : "supplier",
        userId: actor.userId,
        acceptedAt: created.acceptedAt,
        networkAddress,
      };
    } catch (error) {
      if (isUniqueViolation(error, "agreement_acceptance_agreement_user_unique")) {
        throw new DomainError("already-accepted", "That person has accepted this version already.");
      }
      throw error;
    }
  });
}
