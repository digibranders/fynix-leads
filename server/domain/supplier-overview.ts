import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { campaign, campaignShare, invite, member, organisation, user } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/**
 * What the Fynix Suppliers screen reads: a row per supplier with counts, and one supplier in full for the side panel. Both are
 * Fynix reads, open to staff. Fynix sees the email of every person here (the `user` grant for `leads_fynix` has `email`).
 */

const ORGANISATION_REF = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;

export interface SupplierRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  /** Partner agencies working under the supplier. */
  readonly agencyCount: number;
  /** Members of the supplier and of its partner agencies. */
  readonly peopleCount: number;
  /** Campaigns the supplier serves. */
  readonly campaignCount: number;
  /** True when nobody has joined yet and an invite is still live, so the row can say the invite is waiting. */
  readonly inviteWaiting: boolean;
}

function tally<K>(rows: readonly { readonly key: K; readonly n: number }[]): Map<K, number> {
  return new Map(rows.map((row) => [row.key, row.n]));
}

/** Every supplier by name, archived ones included (their status says so). */
export async function listSupplierRows(deps: DomainDeps, actor: FynixActor): Promise<readonly SupplierRow[]> {
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const agencies = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status, parentOrgId: organisation.parentOrgId, createdAt: organisation.createdAt })
      .from(organisation)
      .where(eq(organisation.kind, "agency"))
      .orderBy(asc(organisation.name));
    const people = tally((await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "agency")).groupBy(member.orgId)));
    const campaigns = tally((await tx.select({ key: campaign.agencyOrgId, n: count() }).from(campaign).groupBy(campaign.agencyOrgId)));
    const waiting = tally(
      await tx
        .select({ key: invite.orgId, n: count() })
        .from(invite)
        .where(and(isNull(invite.redeemedAt), isNull(invite.revokedAt), gt(invite.expiresAt, now)))
        .groupBy(invite.orgId),
    );
    return agencies
      .filter((row) => row.parentOrgId === null)
      .map((supplier): SupplierRow => {
        const partners = agencies.filter((row) => row.parentOrgId === supplier.id);
        const own = people.get(supplier.id) ?? 0;
        return {
          id: supplier.id,
          publicRef: supplier.publicRef,
          name: supplier.name,
          status: supplier.status,
          createdAt: supplier.createdAt,
          agencyCount: partners.length,
          peopleCount: own + partners.reduce((sum, partner) => sum + (people.get(partner.id) ?? 0), 0),
          campaignCount: campaigns.get(supplier.id) ?? 0,
          inviteWaiting: own === 0 && (waiting.get(supplier.id) ?? 0) > 0,
        };
      });
  });
}

export interface PartnerAgencyRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly peopleCount: number;
  /** Campaigns the agency holds a share of. */
  readonly campaignCount: number;
}

/** One person on the panel: a member, or someone whose invite has not been accepted. */
export interface SupplierPerson {
  readonly name: string;
  readonly email: string;
  readonly role: "member" | "manager";
  readonly state: "active" | "suspended" | "invited" | "invite-expired";
}

export interface SupplierCampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "draft" | "active" | "paused" | "completed" | "archived";
  readonly clientName: string;
}

export interface SupplierDetail {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly agencies: readonly PartnerAgencyRow[];
  /** The supplier's own people, members first (by name), then invites. */
  readonly people: readonly SupplierPerson[];
  /** Members of the supplier and of its partner agencies, for "2 of 7 shown". */
  readonly peopleTotal: number;
  readonly campaigns: readonly SupplierCampaignRow[];
}

/** One supplier with its partner agencies, people and campaigns, found by its public reference. An unknown reference, or one that is not a supplier, is `not-found`. */
export async function readSupplierDetail(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<SupplierDetail> {
  if (!ORGANISATION_REF.test(publicRef)) throw new DomainError("not-found", "There is no such supplier.");
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status, createdAt: organisation.createdAt, kind: organisation.kind, parentOrgId: organisation.parentOrgId })
      .from(organisation)
      .where(eq(organisation.publicRef, publicRef))
      .limit(1);
    if (found === undefined || found.kind !== "agency" || found.parentOrgId !== null) throw new DomainError("not-found", "There is no such supplier.");

    const partners = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status })
      .from(organisation)
      .where(eq(organisation.parentOrgId, found.id))
      .orderBy(asc(organisation.name));
    const memberCounts = tally(await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "agency")).groupBy(member.orgId));
    const shareCounts = tally(await tx.select({ key: campaignShare.agencyOrgId, n: count() }).from(campaignShare).groupBy(campaignShare.agencyOrgId));

    const members = await tx
      .select({ name: member.displayName, email: user.email, role: member.role, status: member.status })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.orgId, found.id))
      .orderBy(asc(member.displayName));
    const invites = await tx
      .select({ name: invite.name, email: invite.email, role: invite.role, expiresAt: invite.expiresAt })
      .from(invite)
      .where(and(eq(invite.orgId, found.id), isNull(invite.redeemedAt), isNull(invite.revokedAt)))
      .orderBy(asc(invite.name));
    const people: SupplierPerson[] = [
      ...members.map((row): SupplierPerson => ({ name: row.name, email: row.email, role: row.role, state: row.status })),
      ...invites.map((row): SupplierPerson => ({ name: row.name, email: row.email, role: row.role, state: row.expiresAt > now ? "invited" : "invite-expired" })),
    ];

    const campaigns = await tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, clientName: organisation.name })
      .from(campaign)
      .innerJoin(organisation, eq(organisation.id, campaign.clientOrgId))
      .where(eq(campaign.agencyOrgId, found.id))
      .orderBy(asc(campaign.name));

    const agencies = partners.map((row): PartnerAgencyRow => ({ ...row, peopleCount: memberCounts.get(row.id) ?? 0, campaignCount: shareCounts.get(row.id) ?? 0 }));
    return {
      id: found.id,
      publicRef: found.publicRef,
      name: found.name,
      status: found.status,
      createdAt: found.createdAt,
      agencies,
      people,
      peopleTotal: (memberCounts.get(found.id) ?? 0) + agencies.reduce((sum, row) => sum + row.peopleCount, 0),
      campaigns,
    };
  });
}
