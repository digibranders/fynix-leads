import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { tallyCampaigns, type CampaignCounts } from "@/lib/fynix/campaign-counts";
import { campaign, clientCollateral, clientContact, clientProfile, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { readClientContacts, type ClientContactRecord } from "@/server/domain/client-contacts";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { readActivity, readPeople, type ActivityRow, type PersonRow } from "@/server/domain/people-overview";
import { contactColumns, type ClientProfileRecord, type CollateralRecord, type OrganisationContact } from "@/server/domain/organisations";

/** One row of the Fynix Clients screen. Fynix read, open to staff. */
export interface ClientRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly peopleCount: number;
  readonly campaignCount: number;
  readonly campaignCounts: CampaignCounts;
  readonly timeZone: string | null;
  readonly contactEmail: string | null;
}

/** Every client by name, archived ones included (their status says so). */
export async function listClientRows(deps: DomainDeps, actor: FynixActor): Promise<readonly ClientRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clients = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, status: organisation.status, createdAt: organisation.createdAt, timeZone: organisation.timeZone, contactEmail: organisation.contactEmail })
      .from(organisation)
      .where(eq(organisation.kind, "client"))
      .orderBy(asc(organisation.name));
    const people = new Map((await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "client")).groupBy(member.orgId)).map((row) => [row.key, row.n]));
    const statuses = await tx.select({ key: campaign.clientOrgId, status: campaign.status }).from(campaign);
    const firstEmail = new Map<string, string>();
    for (const person of await tx.select({ key: clientContact.clientOrgId, email: clientContact.email }).from(clientContact).where(isNull(clientContact.removedAt)).orderBy(asc(clientContact.createdAt))) {
      if (person.email !== null && !firstEmail.has(person.key)) firstEmail.set(person.key, person.email);
    }
    return clients.map((row): ClientRow => {
      const own = statuses.filter((entry) => entry.key === row.id).map((entry) => entry.status);
      return { ...row, contactEmail: firstEmail.get(row.id) ?? row.contactEmail, peopleCount: people.get(row.id) ?? 0, campaignCount: own.length, campaignCounts: tallyCampaigns(own) };
    });
  });
}

const coordinatorOrg = alias(organisation, "supplier_org");
const ORGANISATION_REF = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;

export interface ClientCampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly coordinatorName: string;
}

/** One client in full: the record, its profile and collateral, its people, its campaigns and the recorded changes. */
export interface ClientDetail {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly timeZone: string | null;
  readonly contact: OrganisationContact;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly profile: ClientProfileRecord | null;
  readonly collateral: readonly CollateralRecord[];
  /** The contact people Fynix keeps for the client. Not logins. */
  readonly contacts: readonly ClientContactRecord[];
  readonly people: readonly PersonRow[];
  readonly campaigns: readonly ClientCampaignRow[];
  readonly campaignCounts: CampaignCounts;
  readonly activity: readonly ActivityRow[];
}

/** A client by its public reference. An unknown reference, or one that is not a client, is `not-found`. Open to staff. */
export async function readClientDetail(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<ClientDetail> {
  if (!ORGANISATION_REF.test(publicRef)) throw new DomainError("not-found", "There is no such client.");
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, timeZone: organisation.timeZone, status: organisation.status, createdAt: organisation.createdAt, ...contactColumns })
      .from(organisation)
      .where(and(eq(organisation.publicRef, publicRef), eq(organisation.kind, "client")))
      .limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such client.");
    const [profile] = await tx
      .select({ clientOrgId: clientProfile.clientOrgId, introduction: clientProfile.introduction, services: clientProfile.services, differentiator: clientProfile.differentiator, caseStudies: clientProfile.caseStudies })
      .from(clientProfile)
      .where(eq(clientProfile.clientOrgId, found.id))
      .limit(1);
    const collateral = await tx
      .select({ id: clientCollateral.id, clientOrgId: clientCollateral.clientOrgId, kind: clientCollateral.kind, title: clientCollateral.title, url: clientCollateral.url, createdAt: clientCollateral.createdAt })
      .from(clientCollateral)
      .where(and(eq(clientCollateral.clientOrgId, found.id), isNull(clientCollateral.removedAt)))
      .orderBy(asc(clientCollateral.createdAt));
    const contacts = await readClientContacts(tx, found.id);
    const campaigns = await tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, coordinatorName: coordinatorOrg.name })
      .from(campaign)
      .innerJoin(coordinatorOrg, eq(coordinatorOrg.id, campaign.agencyOrgId))
      .where(eq(campaign.clientOrgId, found.id))
      .orderBy(desc(campaign.createdAt), asc(campaign.name));
    const people = await readPeople(tx, [{ id: found.id, name: found.name }], now);
    const activity = await readActivity(tx, [found.id, ...people.filter((person) => person.kind === "member").map((person) => person.id)], found.publicRef);
    const { contactName, contactEmail, contactPhone, website, address, notes, ...record } = found;
    return { ...record, contact: { contactName, contactEmail, contactPhone, website, address, notes }, profile: profile ?? null, collateral, contacts, people, campaigns, campaignCounts: tallyCampaigns(campaigns.map((row) => row.status)), activity };
  });
}
