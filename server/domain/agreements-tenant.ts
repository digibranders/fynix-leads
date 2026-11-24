import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { agreement, agreementAcceptance, campaign, member } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";
import { parseInput } from "@/server/domain/parse";
import { uuidSchema } from "@/server/domain/inputs";

/** A tenant manager's side of the one campaign agreement: a client's is `client`, a coordinator's is `supplier`. */
export type TenantAgreementActor = { readonly userId: string; readonly orgId: string; readonly orgKind?: "client" | "agency" };

export interface TenantAgreement {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly clientBrandName: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly publishedAt: Date;
  /** When the signed-in person accepted this version, or null. */
  readonly acceptedAt: Date | null;
  /** When the client side first accepted this version, and when the coordinator side did. Null while waiting. */
  readonly clientAcceptedAt: Date | null;
  readonly supplierAcceptedAt: Date | null;
}

/** When each side first accepted one agreement version: the side and the time, never a person (`app_agreement_acceptance_times`). */
async function acceptanceTimes(tx: ScopedTransaction, agreementId: string): Promise<{ readonly client: Date | null; readonly supplier: Date | null }> {
  const result = await tx.execute<{ side: string; accepted_at: Date | string }>(sql`select side, accepted_at from public.app_agreement_acceptance_times(${agreementId}::uuid)`);
  const at = (side: string): Date | null => {
    const row = result.rows.find((entry) => entry.side === side);
    return row === undefined ? null : new Date(row.accepted_at);
  };
  return { client: at("client"), supplier: at("supplier") };
}

/**
 * The current version of the campaign agreement of every campaign the organisation sees (a client's own campaigns, a coordinator's own), with
 * whether the signed-in person has accepted it and when each side did. Row access is the database's.
 */
export async function listCurrentAgreements(db: Database, actor: TenantAgreementActor): Promise<readonly TenantAgreement[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select({
        id: agreement.id,
        campaignId: agreement.campaignId,
        campaignName: campaign.name,
        clientBrandName: campaign.clientBrandName,
        version: agreement.version,
        monthlyTarget: agreement.monthlyTarget,
        totalTarget: agreement.totalTarget,
        disputeWindowHours: agreement.disputeWindowHours,
        rules: agreement.rules,
        publishedAt: agreement.createdAt,
      })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(and(eq(agreement.party, "client"), eq(agreement.status, "current")))
      .orderBy(campaign.name);

    const accepted = await tx
      .select({ agreementId: agreementAcceptance.agreementId, acceptedAt: agreementAcceptance.acceptedAt })
      .from(agreementAcceptance)
      .where(eq(agreementAcceptance.userId, actor.userId));
    const mine = new Map(accepted.map((row) => [row.agreementId, row.acceptedAt]));

    const result: TenantAgreement[] = [];
    for (const row of rows) {
      const times = await acceptanceTimes(tx, row.id);
      result.push({ ...row, acceptedAt: mine.get(row.id) ?? null, clientAcceptedAt: times.client, supplierAcceptedAt: times.supplier });
    }
    return result;
  });
}

export interface TenantAgreementVersion {
  readonly id: string;
  readonly version: number;
  readonly status: "current" | "superseded";
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly publishedAt: Date;
  /** The viewer's own side: who accepted this version and when (the first person to). Null while the side has not. */
  readonly ownSide: { readonly by: string; readonly at: Date } | null;
  /** When the other side accepted. Its people are never named. */
  readonly otherSideAcceptedAt: Date | null;
  /** The newest version both sides have accepted: its numbers are the campaign's. */
  readonly inForce: boolean;
}

/**
 * Every version of a campaign's agreement, newest first, for the client or the coordinator that is party to it: the numbers, who accepted for the
 * viewer's own side and when, and when the other side did (no name). `not-found` for a campaign the viewer is not party to.
 */
export async function listAgreementVersions(db: Database, actor: TenantAgreementActor & { readonly orgKind: "client" | "agency" }, campaignId: string): Promise<readonly TenantAgreementVersion[]> {
  const id = parseInput(uuidSchema, campaignId);
  const own = actor.orgKind === "client" ? "client" : "supplier";
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select({
        id: agreement.id,
        version: agreement.version,
        status: agreement.status,
        monthlyTarget: agreement.monthlyTarget,
        totalTarget: agreement.totalTarget,
        disputeWindowHours: agreement.disputeWindowHours,
        rules: agreement.rules,
        publishedAt: agreement.createdAt,
      })
      .from(agreement)
      .where(and(eq(agreement.campaignId, id), eq(agreement.party, "client")))
      .orderBy(desc(agreement.version));
    if (rows.length === 0) {
      const [visible] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
      if (visible === undefined) throw new DomainError("not-found", "There is no such campaign.");
      return [];
    }
    const ownRows = await tx
      .select({ agreementId: agreementAcceptance.agreementId, userId: agreementAcceptance.userId, acceptedAt: agreementAcceptance.acceptedAt })
      .from(agreementAcceptance)
      .where(inArray(agreementAcceptance.agreementId, rows.map((row) => row.id)))
      .orderBy(agreementAcceptance.acceptedAt);
    const people = ownRows.length === 0 ? [] : await tx.select({ userId: member.userId, name: member.displayName }).from(member).where(inArray(member.userId, ownRows.map((row) => row.userId)));
    const names = new Map(people.map((row) => [row.userId, row.name]));

    const versions: TenantAgreementVersion[] = [];
    let inForceFound = false;
    for (const row of rows) {
      const times = await acceptanceTimes(tx, row.id);
      const first = ownRows.find((entry) => entry.agreementId === row.id);
      const bothAccepted = times.client !== null && times.supplier !== null;
      versions.push({
        ...row,
        ownSide: first === undefined ? null : { by: names.get(first.userId) ?? "A manager", at: first.acceptedAt },
        otherSideAcceptedAt: own === "client" ? times.supplier : times.client,
        inForce: bothAccepted && !inForceFound,
      });
      if (bothAccepted) inForceFound = true;
    }
    return versions;
  });
}
