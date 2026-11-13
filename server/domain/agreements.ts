import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { agreement, agreementAcceptance, campaign, member } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { publishAgreementSchema, recordAgreementAcceptanceSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotAcceptance, snapshotAgreement } from "@/server/domain/snapshots";

/**
 * The virtual agreements (spec 7.2): what Fynix has agreed with the client, and with the supplier, for one campaign. Each
 * change is a new version; a published version is never edited, only superseded; every version and every acceptance is kept.
 * All three functions are Fynix admin writes except `readAgreements`, which staff may read. No tenant reads any of it until 1E.
 */

export type AgreementParty = "client" | "supplier";

export interface AcceptanceRecord {
  readonly userId: string;
  readonly acceptedAt: Date;
  readonly networkAddress: string;
}

export interface AgreementRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly party: AgreementParty;
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

/** One party's side of a campaign: the version in force and the ones it replaced, newest first. */
export interface AgreementHistory {
  readonly party: AgreementParty;
  readonly current: AgreementRecord | null;
  readonly history: readonly AgreementRecord[];
}

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
 * Publishes the next version of a campaign's agreement with the client or with the supplier, and supersedes the current one
 * in the same transaction. The campaign row is locked first, so two admins publishing at once take turns and the second sees
 * the first's version. The author is the admin's own `member` row.
 */
export async function publishAgreement(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AgreementRecord> {
  const parsed = parseInput(publishAgreementSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit, actorMemberId }) => {
    const [target] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [latest] = await tx
      .select(agreementColumns)
      .from(agreement)
      .where(and(eq(agreement.campaignId, target.id), eq(agreement.party, parsed.party)))
      .orderBy(desc(agreement.version))
      .limit(1);
    // The database allows one current version per campaign and party and does not defer the check, so the old one goes first.
    if (latest?.status === "current") await tx.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, latest.id));
    const [created] = await tx
      .insert(agreement)
      .values({
        campaignId: target.id,
        party: parsed.party,
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
      subject: { table: "agreement", id: created.id, ref: `${target.publicRef} ${created.party} v${created.version}` },
      before: latest === undefined ? null : snapshotAgreement(latest),
      after: snapshotAgreement(created),
    });
    return { ...created, acceptances: [] };
  });
}

/** Both parties' agreements for a campaign: the current version and the history, each version with who accepted it. Open to Fynix staff. */
export async function readAgreements(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<{ readonly client: AgreementHistory; readonly supplier: AgreementHistory }> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const rows = await tx.select(agreementColumns).from(agreement).where(eq(agreement.campaignId, id)).orderBy(desc(agreement.version));
    const accepted =
      rows.length === 0
        ? []
        : await tx
            .select({ agreementId: agreementAcceptance.agreementId, userId: agreementAcceptance.userId, acceptedAt: agreementAcceptance.acceptedAt, networkAddress: agreementAcceptance.networkAddress })
            .from(agreementAcceptance)
            .where(inArray(agreementAcceptance.agreementId, rows.map((row) => row.id)))
            .orderBy(asc(agreementAcceptance.acceptedAt));
    const records = rows.map(
      (row): AgreementRecord => ({
        ...row,
        acceptances: accepted.filter((entry) => entry.agreementId === row.id).map(({ userId, acceptedAt, networkAddress }) => ({ userId, acceptedAt, networkAddress })),
      }),
    );
    const side = (party: AgreementParty): AgreementHistory => ({
      party,
      current: records.find((row) => row.party === party && row.status === "current") ?? null,
      history: records.filter((row) => row.party === party && row.status === "superseded"),
    });
    return { client: side("client"), supplier: side("supplier") };
  });
}

/**
 * Records that a user accepted the current version of an agreement. In phase 1D a Fynix admin records it for the signer;
 * phase 1E lets the signer do it from their own session. The signer must be an active manager of the organisation the
 * agreement is with: the campaign's client for a client agreement, the campaign's supplier for a supplier agreement. A
 * superseded version cannot be accepted (the next version asks again), and nobody accepts the same version twice. The
 * agreement row is read `FOR SHARE`, so a version cannot be superseded in the middle of its own acceptance.
 */
export async function recordAgreementAcceptance(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AcceptanceRecord & { readonly agreementId: string }> {
  const parsed = parseInput(recordAgreementAcceptanceSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx
      .select({ id: agreement.id, party: agreement.party, version: agreement.version, status: agreement.status, clientOrgId: campaign.clientOrgId, supplierOrgId: campaign.agencyOrgId, campaignRef: campaign.publicRef })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(eq(agreement.id, parsed.agreementId))
      .limit(1)
      .for("share", { of: agreement });
    if (target === undefined) throw new DomainError("not-found", "There is no such agreement.");
    if (target.status !== "current") throw new DomainError("agreement-superseded", "That version has been replaced. The current version is the one to accept.");
    const [signer] = await tx.select({ orgId: member.orgId, role: member.role, status: member.status }).from(member).where(eq(member.userId, parsed.userId)).limit(1);
    const withOrgId = target.party === "client" ? target.clientOrgId : target.supplierOrgId;
    if (signer === undefined || signer.orgId !== withOrgId || signer.role !== "manager" || signer.status !== "active") {
      throw new DomainError("not-an-agreement-signer", "An agreement is accepted by an active manager of the organisation it is with.");
    }
    let rows: { readonly id: string; readonly acceptedAt: Date }[];
    try {
      rows = await tx.insert(agreementAcceptance).values({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress }).returning({ id: agreementAcceptance.id, acceptedAt: agreementAcceptance.acceptedAt });
    } catch (error) {
      if (isUniqueViolation(error, "agreement_acceptance_agreement_user_unique")) throw new DomainError("already-accepted", "That person has accepted this version already.");
      throw error;
    }
    const created = rows[0];
    if (created === undefined) throw new Error("The acceptance insert returned no row");
    await audit({
      action: "agreement.accept",
      subject: { table: "agreement_acceptance", id: created.id, ref: `${target.campaignRef} ${target.party} v${target.version}` },
      before: null,
      after: snapshotAcceptance({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress }),
    });
    return { agreementId: target.id, userId: parsed.userId, acceptedAt: created.acceptedAt, networkAddress: parsed.networkAddress };
  });
}
