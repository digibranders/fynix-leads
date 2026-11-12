import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { selectCampaigns, selectOrganisations } from "@/server/db/tenant-reads";
import type { SeedWorld, SeededOrganisation } from "@/server/db/testing/seed";

/**
 * The leak matrix: every read path, run as every tenant role for every organisation of that kind, with the response
 * (or the error message) searched for anything the viewer must not see.
 *
 * To cover a new table or screen, append to READ_PATHS (queries that should succeed) or PROBES (statements that must
 * be denied) below. The test file runs the whole matrix, so a new entry is checked for both roles and both
 * organisations of each kind without any new test code.
 */

/** Who is looking: a tenant role and one seeded organisation of that kind. */
export interface Viewer {
  readonly role: TenantRoleName;
  readonly organisation: SeededOrganisation;
}

export interface ReadPath {
  readonly name: string;
  readonly run: (tx: ScopedTransaction, viewer: Viewer, world: SeedWorld) => Promise<unknown>;
  /** Strings that must appear in the result, so a path that returns nothing at all cannot pass as "no leaks". */
  readonly mustContain: (viewer: Viewer, world: SeedWorld) => readonly string[];
}

export interface Probe {
  readonly name: string;
  /** Test-only SQL, never built from input. */
  readonly statement: string;
  /** What the error must say. Always a plain permission error, never a description of data. */
  readonly expectedError: RegExp;
}

/** The campaigns this viewer is allowed to know about. */
export function ownCampaigns(viewer: Viewer, world: SeedWorld): SeedWorld["campaigns"][number][] {
  return world.campaigns.filter((row) => (viewer.role === "leads_client" ? row.client : row.agency).id === viewer.organisation.id);
}

export const READ_PATHS: readonly ReadPath[] = [
  {
    name: "organisations, typed column list",
    run: (tx, viewer) => selectOrganisations(tx, viewer.role),
    mustContain: (viewer) => [viewer.organisation.publicRef, viewer.organisation.name],
  },
  {
    name: "campaigns, typed column list",
    run: (tx, viewer) => selectCampaigns(tx, viewer.role),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).flatMap((row) => [row.publicRef, row.name]),
  },
  {
    name: "campaigns, filtered and ordered on granted columns",
    run: (tx, viewer) =>
      selectCampaigns(tx, viewer.role)
        .where(and(isNotNull(campaign.publicRef), eq(campaign.status, "draft")))
        .orderBy(asc(campaign.name)),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).map((row) => row.publicRef),
  },
  {
    // Asks for every campaign in the world by reference, including the ones the viewer must not see.
    name: "campaign by reference, for every reference in the world",
    run: async (tx, viewer, world) => {
      const found = [];
      for (const row of world.campaigns) found.push(await selectCampaigns(tx, viewer.role).where(eq(campaign.publicRef, row.publicRef)));
      return found;
    },
    mustContain: (viewer, world) => ownCampaigns(viewer, world).map((row) => row.publicRef),
  },
];

const DENIED_TABLE = /permission denied for table (campaign|organisation)$/m;

export const PROBES: readonly Probe[] = [
  { name: "select * from campaign", statement: "select * from campaign", expectedError: DENIED_TABLE },
  { name: "select * from organisation", statement: "select * from organisation", expectedError: DENIED_TABLE },
  { name: "client organisation id", statement: "select client_org_id from campaign", expectedError: DENIED_TABLE },
  { name: "agency organisation id", statement: "select agency_org_id from campaign", expectedError: DENIED_TABLE },
  { name: "internal notes", statement: "select internal_notes from campaign", expectedError: DENIED_TABLE },
  { name: "organisation id", statement: "select id from organisation", expectedError: DENIED_TABLE },
  { name: "probe by WHERE on a hidden column", statement: "select id from campaign where agency_org_id is not null", expectedError: DENIED_TABLE },
  { name: "probe by ORDER BY on a hidden column", statement: "select id from campaign order by client_org_id", expectedError: DENIED_TABLE },
  { name: "probe by GROUP BY on a hidden column", statement: "select count(*) from campaign group by internal_notes", expectedError: DENIED_TABLE },
  {
    name: "join through the hidden organisation ids",
    statement: "select c.id from campaign c join organisation o on o.id = c.client_org_id",
    expectedError: DENIED_TABLE,
  },
  { name: "write: insert", statement: "insert into campaign (public_ref, name) values ('CMP-0000', 'x')", expectedError: DENIED_TABLE },
  { name: "write: update", statement: "update campaign set name = 'x'", expectedError: DENIED_TABLE },
  { name: "write: delete", statement: "delete from campaign", expectedError: DENIED_TABLE },
  { name: "write: truncate", statement: "truncate campaign", expectedError: DENIED_TABLE },
  { name: "migration bookkeeping", statement: "select * from drizzle.__drizzle_migrations", expectedError: /permission denied for schema drizzle/ },
  { name: "role password hashes", statement: "select rolpassword from pg_authid", expectedError: /permission denied for table pg_authid/ },
  { name: "create a table", statement: "create table leak (x int)", expectedError: /permission denied for schema public/ },
  { name: "create a temporary table", statement: "create temp table leak (x int)", expectedError: /permission denied to create temporary tables/ },
];

/**
 * Every string in the world a viewer must not find, whether in a result or in an error message:
 * - every organisation id, the viewer's own included, because tenants never read an organisation id column;
 * - the reference and name of every other organisation, and the brand of every other client, except that an agency
 *   may know the brand of the clients of its own campaigns (never their legal names);
 * - every campaign's internal notes, and the id, reference and name of every campaign that is not the viewer's.
 */
export function forbiddenTokens(viewer: Viewer, world: SeedWorld): string[] {
  const own = ownCampaigns(viewer, world);
  const brandVisibleFor = new Set(viewer.role === "leads_agency" ? own.map((row) => row.client.id) : []);
  const tokens: string[] = [];
  for (const org of [world.fynix, ...world.clients, ...world.agencies]) {
    tokens.push(org.id);
    if (org.id === viewer.organisation.id) continue;
    tokens.push(org.publicRef, org.name);
    if (org.brandName !== null && !brandVisibleFor.has(org.id)) tokens.push(org.brandName);
  }
  for (const row of world.campaigns) {
    tokens.push(row.internalNotes);
    if (!own.includes(row)) tokens.push(row.id, row.publicRef, row.name);
  }
  return [...new Set(tokens)];
}

/** The forbidden tokens that appear in `text`. */
export function findLeaks(text: string, forbidden: readonly string[]): string[] {
  return forbidden.filter((token) => text.includes(token));
}
