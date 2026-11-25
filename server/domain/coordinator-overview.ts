import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { tallyCampaigns, type CampaignCounts } from "@/lib/fynix/campaign-counts";
import { campaign, campaignShare, invite, member, organisation, user } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { contactColumns, type OrganisationContact } from "@/server/domain/organisations";
import { readActivity, readPeople, type ActivityRow, type PersonRow } from "@/server/domain/people-overview";

/**
 * What the Fynix Coordinators screen reads: a row per coordinator with counts, and one coordinator in full for the side panel. Both are
 * Fynix reads, open to staff. Fynix sees the email of every person here (the `user` grant for `leads_fynix` has `email`).
 */

const ORGANISATION_REF = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;

export interface CoordinatorRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly contactEmail: string | null;
  /** Partner agencies working under the coordinator. */
  readonly agencyCount: number;
  /** The partner agencies' names, by name, so the list can be searched by them. */
  readonly agencyNames: readonly string[];
  /** Members of the coordinator and of its partner agencies. */
  readonly peopleCount: number;
  /** Campaigns the coordinator serves. */
  readonly campaignCount: number;
  /** The same campaigns by what people say: active, closed, setting up. */
  readonly campaignCounts: CampaignCounts;
  /** True when nobody has joined yet and an invite is still live, so the row can say the invite is waiting. */
  readonly inviteWaiting: boolean;
}

function tally<K>(rows: readonly { readonly key: K; readonly n: number }[]): Map<K, number> {
  return new Map(rows.map((row) => [row.key, row.n]));
}

/** Every coordinator by name, archived ones included (their status says so). */
export async function listCoordinatorRows(deps: DomainDeps, actor: FynixActor): Promise<readonly CoordinatorRow[]> {
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const agencies = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status, parentOrgId: organisation.parentOrgId, createdAt: organisation.createdAt, contactEmail: organisation.contactEmail })
      .from(organisation)
      .where(eq(organisation.kind, "agency"))
      .orderBy(asc(organisation.name));
    const people = tally((await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "agency")).groupBy(member.orgId)));
    const campaignStatuses = await tx.select({ key: campaign.agencyOrgId, status: campaign.status }).from(campaign);
    const campaigns = new Map<string, number>();
    for (const row of campaignStatuses) campaigns.set(row.key, (campaigns.get(row.key) ?? 0) + 1);
    const waiting = tally(
      await tx
        .select({ key: invite.orgId, n: count() })
        .from(invite)
        .where(and(isNull(invite.redeemedAt), isNull(invite.revokedAt), gt(invite.expiresAt, now)))
        .groupBy(invite.orgId),
    );
    return agencies
      .filter((row) => row.parentOrgId === null)
      .map((coordinator): CoordinatorRow => {
        const partners = agencies.filter((row) => row.parentOrgId === coordinator.id);
        const own = people.get(coordinator.id) ?? 0;
        return {
          id: coordinator.id,
          publicRef: coordinator.publicRef,
          name: coordinator.name,
          status: coordinator.status,
          createdAt: coordinator.createdAt,
          contactEmail: coordinator.contactEmail,
          agencyCount: partners.length,
          agencyNames: partners.map((partner) => partner.name),
          peopleCount: own + partners.reduce((sum, partner) => sum + (people.get(partner.id) ?? 0), 0),
          campaignCount: campaigns.get(coordinator.id) ?? 0,
          campaignCounts: tallyCampaigns(campaignStatuses.filter((row) => row.key === coordinator.id).map((row) => row.status)),
          inviteWaiting: own === 0 && (waiting.get(coordinator.id) ?? 0) > 0,
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
export interface CoordinatorPerson {
  readonly name: string;
  readonly email: string;
  readonly role: "member" | "manager";
  readonly state: "active" | "suspended" | "invited" | "invite-expired";
}

export interface CoordinatorCampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientName: string;
}

export interface CoordinatorDetail {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly agencies: readonly PartnerAgencyRow[];
  /** The coordinator's own people, members first (by name), then invites. */
  readonly people: readonly CoordinatorPerson[];
  /** Members of the coordinator and of its partner agencies, for "2 of 7 shown". */
  readonly peopleTotal: number;
  readonly campaigns: readonly CoordinatorCampaignRow[];
  readonly campaignCounts: CampaignCounts;
  readonly timeZone: string | null;
  readonly contact: OrganisationContact;
  /** Every person of the coordinator and of its partner agencies, each with the organisation they belong to, plus open invites. */
  readonly everyone: readonly PersonRow[];
  readonly activity: readonly ActivityRow[];
}

/** One coordinator with its partner agencies, people and campaigns, found by its public reference. An unknown reference, or one that is not a coordinator, is `not-found`. */
export async function readCoordinatorDetail(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<CoordinatorDetail> {
  if (!ORGANISATION_REF.test(publicRef)) throw new DomainError("not-found", "There is no such coordinator.");
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status, createdAt: organisation.createdAt, kind: organisation.kind, parentOrgId: organisation.parentOrgId, timeZone: organisation.timeZone, ...contactColumns })
      .from(organisation)
      .where(eq(organisation.publicRef, publicRef))
      .limit(1);
    if (found === undefined || found.kind !== "agency" || found.parentOrgId !== null) throw new DomainError("not-found", "There is no such coordinator.");

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
    const people: CoordinatorPerson[] = [
      ...members.map((row): CoordinatorPerson => ({ name: row.name, email: row.email, role: row.role, state: row.status })),
      ...invites.map((row): CoordinatorPerson => ({ name: row.name, email: row.email, role: row.role, state: row.expiresAt > now ? "invited" : "invite-expired" })),
    ];

    const campaigns = await tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, clientName: organisation.name })
      .from(campaign)
      .innerJoin(organisation, eq(organisation.id, campaign.clientOrgId))
      .where(eq(campaign.agencyOrgId, found.id))
      .orderBy(asc(campaign.name));

    const everyone = await readPeople(tx, [{ id: found.id, name: found.name }, ...partners.map((row) => ({ id: row.id, name: row.name }))], now);
    const activity = await readActivity(tx, [found.id, ...everyone.filter((person) => person.kind === "member").map((person) => person.id)], found.publicRef);
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
      campaignCounts: tallyCampaigns(campaigns.map((row) => row.status)),
      timeZone: found.timeZone,
      contact: { contactName: found.contactName, contactEmail: found.contactEmail, contactPhone: found.contactPhone, website: found.website, address: found.address, notes: found.notes },
      everyone,
      activity,
    };
  });
}
