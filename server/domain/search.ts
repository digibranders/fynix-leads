import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@/server/db/pool";
import { campaign, lead, member, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { searchQuerySchema } from "@/server/domain/inputs";
import { withActorScope, type MessagingActor } from "@/server/domain/messaging-core";
import { parseInput } from "@/server/domain/parse";

/** One thing the search palette found: what to show, a second line, and the page it opens. */
export interface SearchHit {
  readonly label: string;
  readonly detail: string | null;
  readonly href: string;
}

export interface SearchResults {
  readonly leads: readonly SearchHit[];
  readonly people: readonly SearchHit[];
  readonly companies: readonly SearchHit[];
}

/** At most this many of each kind. */
export const SEARCH_LIMIT_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

const EMPTY: SearchResults = { leads: [], people: [], companies: [] };

/** A LIKE pattern that matches the text anywhere and takes `%`, `_` and `\` literally. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * The search palette: leads (reference, prospect, company), people and companies, five of each at most. Every read runs as the caller's own role with the
 * columns that role is granted, so the rules are the database's, not this file's: a client finds its own people and company and never anyone on the
 * supply side, a coordinator or an agency finds people of its own side only (a coordinator also those of its partner agencies) and never a client person,
 * and Fynix finds everyone. A lead is found by reference, prospect name and company, never by email or phone; a draft is not a lead yet and is left out.
 * A query shorter than two characters finds nothing.
 */
export async function searchEverything(db: Database, actor: MessagingActor, query: string): Promise<SearchResults> {
  const text = parseInput(searchQuerySchema, { query }).query;
  if (text.length < MIN_QUERY_LENGTH) return EMPTY;
  const pattern = likePattern(text);
  return withActorScope(db, actor, async (tx) => {
    const portal = await portalFor(tx, actor);
    const leads = await findLeads(tx, portal, pattern);
    const people = await findPeople(tx, actor, portal, pattern);
    const companies = await findCompanies(tx, actor, portal, pattern);
    return { leads, people, companies };
  });
}

/** The path prefix of the caller's own portal: a coordinator and a partner agency are both agencies, told apart by the database. */
async function portalFor(tx: ScopedTransaction, actor: MessagingActor): Promise<"/client" | "/supplier" | "/agency" | "/fynix"> {
  if (actor.orgKind === "client") return "/client";
  if (actor.orgKind === "fynix") return "/fynix";
  const result = await tx.execute<{ partner: boolean }>(sql`select public.app_org_is_partner() as partner`);
  return result.rows[0]?.partner === true ? "/agency" : "/supplier";
}

async function findLeads(tx: ScopedTransaction, portal: string, pattern: string): Promise<readonly SearchHit[]> {
  const rows = await tx
    .select({ ref: lead.publicRef, name: lead.prospectName, company: lead.prospectCompany })
    .from(lead)
    .where(and(eq(lead.released, true), or(ilike(lead.publicRef, pattern), ilike(lead.prospectName, pattern), ilike(lead.prospectCompany, pattern))))
    .orderBy(desc(lead.updatedAt))
    .limit(SEARCH_LIMIT_PER_TYPE);
  return rows.map((row) => ({ label: row.name, detail: `${row.company}, ${row.ref}`, href: `${portal}/leads/${row.ref}` }));
}

async function findPeople(tx: ScopedTransaction, actor: MessagingActor, portal: string, pattern: string): Promise<readonly SearchHit[]> {
  if (actor.orgKind === "fynix") {
    const parent = alias(organisation, "parent_organisation");
    const rows = await tx
      .select({ name: member.displayName, title: member.jobTitle, kind: organisation.kind, orgName: organisation.name, orgRef: organisation.publicRef, parentRef: parent.publicRef })
      .from(member)
      .innerJoin(organisation, eq(organisation.id, member.orgId))
      .leftJoin(parent, eq(parent.id, organisation.parentOrgId))
      .where(and(eq(member.status, "active"), ilike(member.displayName, pattern)))
      .orderBy(member.displayName)
      .limit(SEARCH_LIMIT_PER_TYPE);
    return rows.map((row) => ({
      label: row.name,
      detail: [row.title, row.orgName].filter((part): part is string => part !== null).join(", "),
      href: row.kind === "client" ? `/fynix/clients/${row.orgRef}/people` : row.kind === "agency" ? `/fynix/suppliers/${row.parentRef ?? row.orgRef}/people` : "/fynix/settings",
    }));
  }
  // The caller's own people, and for a coordinator its partner agencies': the same list the Team page shows, which never reaches the other side.
  const result = await tx.execute<{ name: string; job_title: string | null; org_name: string }>(
    sql`select name, job_title, org_name from public.app_my_team() where kind = 'member' and status = 'active' and name ilike ${pattern} order by name limit ${SEARCH_LIMIT_PER_TYPE}`,
  );
  return result.rows.map((row) => ({ label: row.name, detail: [row.job_title, row.org_name].filter((part): part is string => part !== null).join(", "), href: `${portal}/team` }));
}

async function findCompanies(tx: ScopedTransaction, actor: MessagingActor, portal: string, pattern: string): Promise<readonly SearchHit[]> {
  if (actor.orgKind === "fynix") {
    const parent = alias(organisation, "parent_organisation");
    const rows = await tx
      .select({ name: organisation.name, ref: organisation.publicRef, kind: organisation.kind, parentRef: parent.publicRef })
      .from(organisation)
      .leftJoin(parent, eq(parent.id, organisation.parentOrgId))
      .where(and(eq(organisation.status, "active"), ilike(organisation.name, pattern)))
      .orderBy(organisation.name)
      .limit(SEARCH_LIMIT_PER_TYPE);
    return rows
      .filter((row) => row.kind !== "fynix")
      .map((row) => ({ label: row.name, detail: row.kind === "client" ? "Client" : row.parentRef === null ? "Coordinator" : "Agency", href: row.kind === "client" ? `/fynix/clients/${row.ref}` : `/fynix/suppliers/${row.parentRef ?? row.ref}` }));
  }
  // A tenant reads its own organisation row (a coordinator also its partner agencies', which it manages), and nothing of the other side. Only an agency
  // may read `parent_org_id`; a client's company is its own, so it needs no more than the name.
  if (actor.orgKind === "client") {
    const rows = await tx.select({ name: organisation.name }).from(organisation).where(ilike(organisation.name, pattern)).orderBy(organisation.name).limit(SEARCH_LIMIT_PER_TYPE);
    return rows.map((row) => ({ label: row.name, detail: "Your company", href: "/client" }));
  }
  const rows = await tx
    .select({ name: organisation.name, parentOrgId: organisation.parentOrgId })
    .from(organisation)
    .where(ilike(organisation.name, pattern))
    .orderBy(organisation.name)
    .limit(SEARCH_LIMIT_PER_TYPE);
  const own = rows.map((row) => ({ label: row.name, detail: row.parentOrgId === null || portal === "/agency" ? "Your company" : "Partner agency", href: row.parentOrgId === null || portal === "/agency" ? portal : `${portal}/agencies` }));
  // The supply side may know the brand of the clients of the campaigns it serves, and no more of them.
  const brands = await tx
    .select({ brand: campaign.clientBrandName })
    .from(campaign)
    .where(ilike(campaign.clientBrandName, pattern))
    .groupBy(campaign.clientBrandName)
    .orderBy(campaign.clientBrandName)
    .limit(SEARCH_LIMIT_PER_TYPE);
  return [...own, ...brands.map((row) => ({ label: row.brand, detail: "Client", href: `${portal}/campaigns` }))].slice(0, SEARCH_LIMIT_PER_TYPE);
}
