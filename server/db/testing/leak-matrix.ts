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

const DENIED_TABLE = /permission denied for table [a-z_]+$/m;

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
  // Phase 1B: the auth tables, the member table and the tables only leads_public uses. No tenant role may read or write any of them.
  { name: "auth: every user", statement: 'select * from "user"', expectedError: DENIED_TABLE },
  { name: "auth: email addresses", statement: 'select email from "user"', expectedError: DENIED_TABLE },
  { name: "auth: probe users by WHERE on the email", statement: `select id from "user" where email like '%@%'`, expectedError: DENIED_TABLE },
  { name: "auth: password hashes", statement: "select password from account", expectedError: DENIED_TABLE },
  { name: "auth: session tokens", statement: "select token from session", expectedError: DENIED_TABLE },
  { name: "auth: reset tokens", statement: "select identifier, value from verification", expectedError: DENIED_TABLE },
  { name: "auth: join every auth table", statement: 'select u.email, a.password, s.token from "user" u join account a on a.user_id = u.id join session s on s.user_id = u.id', expectedError: DENIED_TABLE },
  { name: "member: every membership", statement: "select * from member", expectedError: DENIED_TABLE },
  { name: "member: organisation of a user", statement: "select user_id, org_id from member", expectedError: DENIED_TABLE },
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
  { name: "campaign: the ideal customer profile", statement: "select icp from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the instructions", statement: "select instructions from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the BANT criteria", statement: "select bant_budget, bant_authority, bant_need, bant_timeline from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: geography, industries, titles, seniority, technologies and size", statement: "select geography, industries, job_titles, seniority, technologies, company_size from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: probe by a requirement in WHERE", statement: "select id from campaign where icp <> ''", expectedError: DENIED_TABLE },
  // Phase 1D: the organisation hierarchy, the campaign settings and the six set-up tables. Nothing here is granted to a tenant until 1E.
  { name: "organisation: the supplier a partner agency works under", statement: "select parent_org_id from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the kind of the parent", statement: "select parent_org_kind from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: probe the hierarchy by WHERE", statement: "select name from organisation where parent_org_id is not null", expectedError: DENIED_TABLE },
  { name: "organisation: join an organisation to its parent", statement: "select c.name from organisation c join organisation p on p.id = c.parent_org_id", expectedError: DENIED_TABLE },
  { name: "write: give an organisation a parent", statement: "update organisation set parent_org_id = null", expectedError: DENIED_TABLE },
  { name: "campaign: the time zone", statement: "select time_zone from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the meeting length", statement: "select meeting_minutes from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: probe by the time zone in WHERE", statement: "select id from campaign where time_zone = 'Europe/London'", expectedError: DENIED_TABLE },
  { name: "write: change the time zone of a campaign", statement: "update campaign set time_zone = 'UTC', meeting_minutes = 15", expectedError: DENIED_TABLE },
  { name: "agreements: every agreement", statement: "select * from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: the targets", statement: "select monthly_target, total_target from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: the rules, the notes and the dispute window", statement: "select rules, notes, dispute_window_hours from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: join a campaign to its agreements", statement: "select c.name, a.monthly_target from campaign c join agreement a on a.campaign_id = c.id", expectedError: DENIED_TABLE },
  { name: "agreements: probe by the party in WHERE", statement: "select id from agreement where party = 'supplier'", expectedError: DENIED_TABLE },
  { name: "agreements: every acceptance", statement: "select * from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "agreements: who accepted, and from where", statement: "select user_id, network_address from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "write: publish an agreement", statement: "insert into agreement (campaign_id, party, version, monthly_target, total_target, created_by) values (gen_random_uuid(), 'client', 1, 1, 1, gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: supersede an agreement", statement: "update agreement set status = 'superseded'", expectedError: DENIED_TABLE },
  { name: "write: accept an agreement as someone else", statement: "insert into agreement_acceptance (agreement_id, user_id, network_address) values (gen_random_uuid(), gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "shares: every share", statement: "select * from campaign_share", expectedError: DENIED_TABLE },
  { name: "shares: how much each agency carries", statement: "select agency_org_id, monthly_share from campaign_share", expectedError: DENIED_TABLE },
  { name: "shares: join a campaign to its shares", statement: "select c.name, s.monthly_share from campaign c join campaign_share s on s.campaign_id = c.id", expectedError: DENIED_TABLE },
  { name: "write: set a share", statement: "insert into campaign_share (campaign_id, agency_org_id, monthly_share) values (gen_random_uuid(), gen_random_uuid(), 1)", expectedError: DENIED_TABLE },
  { name: "write: change a share", statement: "update campaign_share set monthly_share = 0", expectedError: DENIED_TABLE },
  { name: "write: remove a share", statement: "delete from campaign_share", expectedError: DENIED_TABLE },
  { name: "hosts: every host", statement: "select * from campaign_host", expectedError: DENIED_TABLE },
  { name: "hosts: who they are and what they do", statement: "select member_id, job_title, active from campaign_host", expectedError: DENIED_TABLE },
  { name: "hosts: the client organisation behind a campaign", statement: "select client_org_id from campaign_host", expectedError: DENIED_TABLE },
  { name: "write: add a host", statement: "insert into campaign_host (campaign_id, client_org_id, member_id, job_title) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "write: deactivate a host", statement: "update campaign_host set active = false", expectedError: DENIED_TABLE },
  { name: "write: remove a host", statement: "delete from campaign_host", expectedError: DENIED_TABLE },
  { name: "hours: every window", statement: "select * from host_hours", expectedError: DENIED_TABLE },
  { name: "hours: the time zone and the weekdays", statement: "select member_id, time_zone, weekday, start_minute, end_minute from host_hours", expectedError: DENIED_TABLE },
  { name: "write: set hours", statement: "insert into host_hours (member_id, time_zone, weekday, start_minute, end_minute) values (gen_random_uuid(), 'UTC', 1, 0, 60)", expectedError: DENIED_TABLE },
  { name: "write: clear hours", statement: "delete from host_hours", expectedError: DENIED_TABLE },
  { name: "blocks: every blocked time", statement: "select * from host_block", expectedError: DENIED_TABLE },
  { name: "blocks: when and why", statement: "select starts_at, ends_at, note from host_block", expectedError: DENIED_TABLE },
  { name: "write: block a time", statement: "insert into host_block (member_id, starts_at, ends_at) values (gen_random_uuid(), now(), now() + interval '1 hour')", expectedError: DENIED_TABLE },
  { name: "write: remove a blocked time", statement: "delete from host_block", expectedError: DENIED_TABLE },
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
  // Phase 1B: no tenant role reads anything about any user, its own colleagues included. Phase 1E gives tenants a
  // column-limited read of their organisation-mates through `member`, and narrows this loop to the other side's users.
  for (const person of world.users) tokens.push(person.id, person.email, person.name, person.passwordHash, person.sessionToken, person.resetToken);
  // Phase 1C: no tenant role reads an invite, an alias, an acceptance, the audit log or the outbox. Phase 1E gives each
  // tenant its own acceptances and its own alias, and narrows this to the other side's.
  const { domain } = world;
  if (domain !== null) {
    for (const row of domain.invites) tokens.push(row.id, row.email, row.name, row.token, row.tokenHash);
    tokens.push(...domain.aliases, ...domain.acceptanceAddresses, ...domain.auditMarkers, domain.outboxRecipient, domain.outboxLink, ...Object.values(domain.termsDocumentIds));
  }
  // Phase 1D: no tenant role reads a partner agency, an agreement, an acceptance, a share, a host, working hours or a blocked
  // time. Phase 1E gives each tenant the rows that are its own and narrows this to the other side's.
  const { setup } = world;
  if (setup !== null) tokens.push(setup.partner.id, setup.partner.publicRef, setup.partner.name, ...setup.markers);
  return [...new Set(tokens)];
}

/** The forbidden tokens that appear in `text`. */
export function findLeaks(text: string, forbidden: readonly string[]): string[] {
  return forbidden.filter((token) => text.includes(token));
}
