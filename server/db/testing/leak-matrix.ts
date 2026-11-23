import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign, member } from "@/server/db/schema";
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
  /** The roles the probe applies to, when the column it asks for is readable by the other role. Every tenant role when absent. */
  readonly roles?: readonly TenantRoleName[];
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
    // Every membership the role may read. Own-organisation people only: the ids of other organisations' people are forbidden tokens.
    name: "member rows, every column a tenant role may read except the organisation",
    run: (tx) => tx.select({ id: member.id, userId: member.userId, role: member.role, displayName: member.displayName, status: member.status }).from(member),
    mustContain: (viewer, world) => world.users.filter((person) => person.organisation.id === viewer.organisation.id).map((person) => person.id),
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

const DENIED_TABLE = /permission denied for table [a-z_]+$/m;

export const PROBES: readonly Probe[] = [
  { name: "select * from campaign", statement: "select * from campaign", expectedError: DENIED_TABLE },
  { name: "select * from organisation", statement: "select * from organisation", expectedError: DENIED_TABLE },
  // Since migrations 0037 and 0039 both roles read campaign.client_org_id and agency_org_id (opaque ids on rows they already see), so the kinds stay the probe.
  { name: "client organisation kind", statement: "select client_org_kind from campaign", expectedError: DENIED_TABLE },
  { name: "agency organisation kind", statement: "select agency_org_kind from campaign", expectedError: DENIED_TABLE },
  { name: "internal notes", statement: "select internal_notes from campaign", expectedError: DENIED_TABLE },
  { name: "organisation id", statement: "select id from organisation", expectedError: DENIED_TABLE },
  { name: "probe by WHERE on a hidden column", statement: "select id from campaign where internal_notes like 'INTERNAL%'", expectedError: DENIED_TABLE },
  { name: "probe by ORDER BY on a hidden column", statement: "select id from campaign order by agency_org_kind", expectedError: DENIED_TABLE },
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
  // Phase 1B: the auth tables, the member table and the tables only leads_public uses. No tenant role may read or write any of them.
  { name: "auth: every user", statement: 'select * from "user"', expectedError: DENIED_TABLE },
  { name: "auth: email addresses", statement: 'select email from "user"', expectedError: DENIED_TABLE },
  { name: "auth: probe users by WHERE on the email", statement: `select id from "user" where email like '%@%'`, expectedError: DENIED_TABLE },
  { name: "auth: password hashes", statement: "select password from account", expectedError: DENIED_TABLE },
  { name: "auth: session tokens", statement: "select token from session", expectedError: DENIED_TABLE },
  { name: "auth: reset tokens", statement: "select identifier, value from verification", expectedError: DENIED_TABLE },
  { name: "auth: join every auth table", statement: 'select u.email, a.password, s.token from "user" u join account a on a.user_id = u.id join session s on s.user_id = u.id', expectedError: DENIED_TABLE },
  // Tenant roles read member (migration 0032), so the read path "member rows" covers what they may see; writes stay refused.
  { name: "write: add a membership", statement: "insert into member (user_id, org_id, org_kind, role) values (gen_random_uuid(), gen_random_uuid(), 'client', 'manager')", expectedError: DENIED_TABLE },
  { name: "write: remove every membership", statement: "delete from member", expectedError: DENIED_TABLE },
  { name: "rate limits", statement: "select * from rate_limit", expectedError: DENIED_TABLE },
  { name: "email outbox", statement: "select * from email_outbox", expectedError: DENIED_TABLE },
  { name: "write: create a user", statement: `insert into "user" (name, email) values ('x', 'x@example.com')`, expectedError: DENIED_TABLE },
  { name: "write: replace a password hash", statement: "update account set password = 'x'", expectedError: DENIED_TABLE },
  { name: "write: end every session", statement: "delete from session", expectedError: DENIED_TABLE },
  { name: "write: move a member to another organisation", statement: "update member set org_id = org_id", expectedError: DENIED_TABLE },
  { name: "write: queue an email", statement: "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')", expectedError: DENIED_TABLE },
  { name: "write: reset a rate limit", statement: "delete from rate_limit", expectedError: DENIED_TABLE },
  // Phase 1C: the domain tables, and the campaign requirement columns that stay hidden until phase 1E grants them.
  { name: "invites: every invite", statement: "select * from invite", expectedError: DENIED_TABLE },
  { name: "invites: the invited address and name", statement: "select email, name from invite", expectedError: DENIED_TABLE },
  { name: "invites: the token hash", statement: "select token_hash from invite", expectedError: DENIED_TABLE },
  { name: "invites: probe by the hash in WHERE", statement: "select id from invite where token_hash like 'a%'", expectedError: DENIED_TABLE },
  { name: "write: redeem an invite", statement: "update invite set redeemed_at = now()", expectedError: DENIED_TABLE },
  { name: "write: issue an invite", statement: "insert into invite (org_id, org_kind, email, name, token_hash, expires_at, created_by) values (gen_random_uuid(), 'client', 'x@example.com', 'x', 'x', now(), gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "terms: documents", statement: "select * from terms_document", expectedError: DENIED_TABLE },
  { name: "terms: acceptances and the addresses they came from", statement: "select user_id, network_address from terms_acceptance", expectedError: DENIED_TABLE },
  { name: "write: accept terms as someone else", statement: "insert into terms_acceptance (user_id, document_id, party, network_address) values (gen_random_uuid(), gen_random_uuid(), 'client', 'x')", expectedError: DENIED_TABLE },
  { name: "write: publish terms", statement: "insert into terms_document (party, version, title, body) values ('client', 9, 'x', 'x')", expectedError: DENIED_TABLE },
  { name: "aliases: every alias", statement: "select * from agency_alias", expectedError: DENIED_TABLE },
  { name: "aliases: which member has which alias", statement: "select member_id, alias from agency_alias", expectedError: DENIED_TABLE },
  { name: "write: give a member an alias", statement: "insert into agency_alias (member_id, alias) values (gen_random_uuid(), 'Someone, Fynix')", expectedError: DENIED_TABLE },
  { name: "audit: every row", statement: "select * from audit_log", expectedError: DENIED_TABLE },
  { name: "audit: before and after", statement: "select before, after from audit_log", expectedError: DENIED_TABLE },
  { name: "write: add an audit row", statement: "insert into audit_log (action, subject_table, subject_id) values ('x.y', 'campaign', gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: change the audit log", statement: "update audit_log set action = 'x.y'", expectedError: DENIED_TABLE },
  { name: "write: erase the audit log", statement: "delete from audit_log", expectedError: DENIED_TABLE },
  { name: "outbox: the link a message carries", statement: "select link from email_outbox", expectedError: DENIED_TABLE },
  { name: "outbox: who was written to", statement: "select recipient, subject from email_outbox", expectedError: DENIED_TABLE },
  { name: "write: cancel a message", statement: "update email_outbox set status = 'cancelled'", expectedError: DENIED_TABLE },
  // Since migration 0054 the agency role (suppliers and partner agencies) reads the brief; a client still may not.
  { name: "campaign: the ideal customer profile", statement: "select icp from campaign", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "campaign: the instructions", statement: "select instructions from campaign", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "campaign: the BANT criteria", statement: "select bant_budget, bant_authority, bant_need, bant_timeline from campaign", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "campaign: geography, industries, titles, seniority, technologies and size", statement: "select geography, industries, job_titles, seniority, technologies, company_size from campaign", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "campaign: probe by a requirement in WHERE", statement: "select id from campaign where icp <> ''", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  // Phase 1D: the organisation hierarchy, the campaign settings and the six set-up tables. Nothing here is granted to a tenant until 1E.
  // leads_agency reads organisation.parent_org_id (migration 0032); a client still may not, so the hierarchy probes by id are for clients only.
  { name: "organisation: the supplier a partner agency works under", statement: "select parent_org_id from organisation", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "organisation: the status", statement: "select status from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the kind of the parent", statement: "select parent_org_kind from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: probe the hierarchy by WHERE", statement: "select name from organisation where parent_org_id is not null", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "organisation: probe by the status in WHERE", statement: "select name from organisation where status = 'active'", expectedError: DENIED_TABLE },
  { name: "organisation: join an organisation to its parent", statement: "select c.name from organisation c join organisation p on p.id = c.parent_org_id", expectedError: DENIED_TABLE },
  { name: "write: give an organisation a parent", statement: "update organisation set parent_org_id = null", expectedError: DENIED_TABLE },
  { name: "campaign: the time zone", statement: "select time_zone from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the meeting length", statement: "select meeting_minutes from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: probe by the time zone in WHERE", statement: "select id from campaign where time_zone = 'Europe/London'", expectedError: DENIED_TABLE },
  { name: "write: change the time zone of a campaign", statement: "update campaign set time_zone = 'UTC', meeting_minutes = 15", expectedError: DENIED_TABLE },
  { name: "agreements: every agreement", statement: "select * from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: internal notes", statement: "select notes from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: author member id", statement: "select created_by from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: every acceptance", statement: "select * from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "agreements: network address of acceptance", statement: "select network_address from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "write: publish an agreement", statement: "insert into agreement (campaign_id, party, version, monthly_target, total_target, created_by) values (gen_random_uuid(), 'client', 1, 1, 1, gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: supersede an agreement", statement: "update agreement set status = 'superseded'", expectedError: DENIED_TABLE },
  { name: "shares: every share", statement: "select * from campaign_share", expectedError: DENIED_TABLE },
  { name: "hosts: every host", statement: "select * from campaign_host", expectedError: DENIED_TABLE },
  { name: "hours: every window", statement: "select * from host_hours", expectedError: DENIED_TABLE },
  { name: "blocks: every blocked time", statement: "select * from host_block", expectedError: DENIED_TABLE },
  { name: "aliases: every alias identity", statement: "select * from alias_identity", expectedError: DENIED_TABLE },
  { name: "aliases: verification code hash", statement: "select verification_code_hash from alias_identity", expectedError: DENIED_TABLE },
];

/**
 * Every string in the world a viewer must not find, whether in a result or in an error message:
 * - every organisation id, the viewer's own included, because tenants never read an organisation id column (the one exception
 *   is the supplier's own id, which it reads as the parent_org_id of its partner agencies);
 * - the reference and name of every other organisation, and the brand of every other client, except that an agency
 *   may know the brand of the clients of its own campaigns (never their legal names);
 * - every campaign's internal notes, and the id, reference and name of every campaign that is not the viewer's.
 */
export function forbiddenTokens(viewer: Viewer, world: SeedWorld): string[] {
  const own = ownCampaigns(viewer, world);
  const brandVisibleFor = new Set(viewer.role === "leads_agency" ? own.map((row) => row.client.id) : []);
  const ownIdVisible = viewer.role === "leads_agency" && world.setup !== null && viewer.organisation.id === world.brightpath.id;
  const tokens: string[] = [];
  for (const org of [world.fynix, ...world.clients, ...world.agencies]) {
    // The supplier reads parent_org_id on its partner agencies (migration 0032), which is its own id; no tenant reads an organisation.id column.
    if (!(org.id === viewer.organisation.id && ownIdVisible)) tokens.push(org.id);
    if (org.id === viewer.organisation.id) continue;
    tokens.push(org.publicRef, org.name);
    if (org.brandName !== null && !brandVisibleFor.has(org.id)) tokens.push(org.brandName);
  }
  for (const row of world.campaigns) {
    tokens.push(row.internalNotes);
    if (!own.includes(row)) tokens.push(row.id, row.publicRef, row.name);
  }
  // Phase 1B/1E: a tenant role reads its own organisation-mates through member, but never credentials or other organisations' users.
  for (const person of world.users) {
    if (person.organisation.id === viewer.organisation.id) {
      tokens.push(person.passwordHash, person.sessionToken, person.resetToken);
    } else {
      tokens.push(person.id, person.email, person.name, person.passwordHash, person.sessionToken, person.resetToken);
    }
  }
  // Phase 1C: no tenant role reads an invite, an alias, an acceptance, the audit log or the outbox. Phase 1E gives each
  // tenant its own acceptances and its own alias, and narrows this to the other side's.
  const { domain } = world;
  if (domain !== null) {
    for (const row of domain.invites) tokens.push(row.id, row.email, row.name, row.token, row.tokenHash);
    tokens.push(...domain.aliases, ...domain.acceptanceAddresses, ...domain.auditMarkers, domain.outboxRecipient, domain.outboxLink, ...Object.values(domain.termsDocumentIds));
  }
  // Phase 1D/1E: each tenant reads rows that are its own (supplier reads partner agencies under it; other tenants do not).
  const { setup } = world;
  if (setup !== null) {
    const isParentSupplier = viewer.organisation.id === world.brightpath.id;
    if (!isParentSupplier && viewer.organisation.id !== setup.partner.id) {
      tokens.push(setup.partner.id, setup.partner.publicRef, setup.partner.name);
    }
    tokens.push(...setup.markers);
  }
  return [...new Set(tokens)];
}

/** The forbidden tokens that appear in `text`. */
export function findLeaks(text: string, forbidden: readonly string[]): string[] {
  return forbidden.filter((token) => text.includes(token));
}
