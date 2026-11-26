import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign, clientCollateral, clientProfile, member } from "@/server/db/schema";
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
  /** Strings this one path may show, such as the names of the people of a client an agency serves. Each is removed from the result before it is searched for forbidden tokens. */
  readonly allowedTokens?: (viewer: Viewer, world: SeedWorld) => readonly string[];
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

/** The client profiles this viewer may read: its own (a client), or those of the clients of the campaigns it serves (an agency). */
export function visibleProfiles(viewer: Viewer, world: SeedWorld): SeedWorld["profiles"][number][] {
  const clientIds = new Set(viewer.role === "leads_client" ? [viewer.organisation.id] : ownCampaigns(viewer, world).map((row) => row.client.id));
  return world.profiles.filter((profile) => clientIds.has(profile.client.id));
}

/** The campaigns whose client team a viewer may read, which are its own: a client's campaigns, or the campaigns an agency serves. Tenants name a team by a campaign, never by an organisation id. */
function teamCampaignIds(viewer: Viewer, world: SeedWorld): string[] {
  return ownCampaigns(viewer, world).map((row) => row.id);
}

function teamNames(viewer: Viewer, world: SeedWorld): string[] {
  const clients = new Set(ownCampaigns(viewer, world).map((row) => row.client.id));
  return world.users.filter((person) => clients.has(person.organisation.id)).map((person) => person.name);
}

/** The time zone of each client whose team a viewer may read. An agency already reads the zone, hours and blocked times of those people (the lead form), so the client's own zone, which fills in for a person with no hours, is the same kind of fact. */
function teamZones(viewer: Viewer, world: SeedWorld): string[] {
  const clients = new Set(ownCampaigns(viewer, world).map((row) => row.client.id));
  return world.profiles.filter((profile) => clients.has(profile.client.id)).map((profile) => profile.timeZone);
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
    // Phase 1 chunk A: the two person fields a tenant may read, for its own organisation only.
    name: "member job titles and phones",
    run: (tx) => tx.select({ jobTitle: member.jobTitle, phone: member.phone }).from(member),
    mustContain: (viewer, world) => world.users.filter((person) => person.organisation.id === viewer.organisation.id).flatMap((person) => [person.jobTitle, person.phone]),
  },
  {
    // Phase 1 chunk C: the Team page reads its own side's people, email included, through a definer function and nothing else.
    name: "my team (app_my_team)",
    run: (tx) => tx.execute(sql`select * from public.app_my_team()`),
    mustContain: (viewer, world) => world.users.filter((person) => person.organisation.id === viewer.organisation.id).flatMap((person) => [person.email, person.name, person.jobTitle, person.phone]),
  },
  {
    // A client reads its own profile; a coordinator or agency reads the profiles of the clients of the campaigns it sees (and no others).
    name: "client profiles and live collateral",
    run: async (tx) => ({
      profiles: await tx.select({ introduction: clientProfile.introduction, services: clientProfile.services, differentiator: clientProfile.differentiator, caseStudies: clientProfile.caseStudies }).from(clientProfile),
      collateral: await tx.select({ kind: clientCollateral.kind, title: clientCollateral.title, url: clientCollateral.url }).from(clientCollateral),
    }),
    mustContain: (viewer, world) =>
      visibleProfiles(viewer, world).flatMap((profile) => [profile.introduction, profile.services, profile.differentiator, profile.caseStudies, profile.collateralTitle, profile.collateralUrl]),
  },
  {
    name: "campaigns, typed column list",
    run: (tx, viewer) => selectCampaigns(tx, viewer.role),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).flatMap((row) => [row.publicRef, row.name]),
  },
  {
    // Phase 2: both roles read the brief of their own campaigns, never the notes.
    name: "campaign brief (migrations 0054 and 0064)",
    run: (tx) => tx.select({ publicRef: campaign.publicRef, icp: campaign.icp, instructions: campaign.instructions, industries: campaign.industries }).from(campaign),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).map((row) => row.publicRef),
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
  {
    // Calendar step C: the people of a client, by name and time zone, for the client itself and the agencies that serve it. A name and nothing else.
    name: "the team of a client, names only",
    run: async (tx, viewer, world) => {
      const rows: unknown[] = [];
      for (const id of teamCampaignIds(viewer, world)) rows.push((await tx.execute(sql`select * from public.app_team_people_for_campaign(${id}::uuid)`)).rows);
      return rows;
    },
    mustContain: (viewer, world) => teamNames(viewer, world),
    allowedTokens: (viewer, world) => [...teamNames(viewer, world), ...teamZones(viewer, world)],
  },
  {
    // The busy time over the next ten days, asked for every campaign in the world. The seeded world has no busy time, so the result is empty: the path proves that a
    // campaign the viewer may not read answers with nothing and that nothing but bare times can come out of the function.
    name: "the busy time of a client's team",
    run: async (tx, _viewer, world) => {
      const rows: unknown[] = [];
      for (const row of world.campaigns) rows.push((await tx.execute(sql`select * from public.app_team_busy_for_campaign(${row.id}::uuid, now(), now() + interval '10 days')`)).rows);
      return rows;
    },
    mustContain: () => [],
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
  { name: "auth: authenticator secrets", statement: "select secret, backup_codes from two_factor", expectedError: DENIED_TABLE },
  { name: "write: turn off someone's second step", statement: "delete from two_factor", expectedError: DENIED_TABLE },
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
  // Since migrations 0032 and 0059 a tenant reads the address, name, job title and phone of the invites of its own side (row-level security), so the probe is the author.
  { name: "invites: who issued an invite", statement: "select created_by from invite", expectedError: DENIED_TABLE },
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
  // Since migrations 0054 and 0064 both tenant roles read the campaign brief of the campaigns they see; internal notes and settings stay hidden (probes below).
  // Phase 1D: the organisation hierarchy, the campaign settings and the six set-up tables. Nothing here is granted to a tenant until 1E.
  // leads_agency reads organisation.parent_org_id (migration 0032); a client still may not, so the hierarchy probes by id are for clients only.
  { name: "organisation: the coordinator a partner agency works under", statement: "select parent_org_id from organisation", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "organisation: the status", statement: "select status from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the kind of the parent", statement: "select parent_org_kind from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: probe the hierarchy by WHERE", statement: "select name from organisation where parent_org_id is not null", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "organisation: probe by the status in WHERE", statement: "select name from organisation where status = 'active'", expectedError: DENIED_TABLE },
  { name: "organisation: join an organisation to its parent", statement: "select c.name from organisation c join organisation p on p.id = c.parent_org_id", expectedError: DENIED_TABLE },
  { name: "write: give an organisation a parent", statement: "update organisation set parent_org_id = null", expectedError: DENIED_TABLE },
  { name: "campaign: when it was closed", statement: "select closed_at from campaign", expectedError: DENIED_TABLE },
  { name: "write: close a campaign", statement: "update campaign set closed_at = now()", expectedError: DENIED_TABLE },
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
  // Phase 1 chunk A: the profile is Fynix-written, the file reference and the time zone are not for tenants, and no tenant reads another side's people.
  { name: "client profile: every column", statement: "select * from client_profile", expectedError: DENIED_TABLE },
  { name: "client profile: write", statement: "update client_profile set services = 'x'", expectedError: DENIED_TABLE },
  { name: "client profile: insert", statement: "insert into client_profile (client_org_id, introduction) values (gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "collateral: every column", statement: "select * from client_collateral", expectedError: DENIED_TABLE },
  { name: "collateral: the file reference", statement: "select file_ref from client_collateral", expectedError: DENIED_TABLE },
  { name: "collateral: when it was removed", statement: "select removed_at from client_collateral", expectedError: DENIED_TABLE },
  { name: "collateral: write", statement: "insert into client_collateral (client_org_id, kind, title, url) values (gen_random_uuid(), 'link', 'x', 'https://x.example')", expectedError: DENIED_TABLE },
  { name: "collateral: remove", statement: "update client_collateral set removed_at = now()", expectedError: DENIED_TABLE },
  // Migration 0082: the contact people of a client are Fynix's alone, for a client and an agency alike.
  { name: "client contacts: every column", statement: "select * from client_contact", expectedError: DENIED_TABLE },
  { name: "client contacts: write", statement: "insert into client_contact (client_org_id, name) values (gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "client contacts: remove", statement: "update client_contact set removed_at = now()", expectedError: DENIED_TABLE },
  { name: "organisation: the time zone", statement: "select time_zone from organisation", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  // Migration 0080: the company contact details are Fynix's alone. No tenant role may read or change any of them, its own company's included.
  { name: "organisation: the contact name", statement: "select contact_name from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the contact email", statement: "select contact_email from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the contact phone", statement: "select contact_phone from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the website", statement: "select website from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the address", statement: "select address from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the internal notes", statement: "select notes from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: probe by the contact email in WHERE", statement: "select name from organisation where contact_email is not null", expectedError: DENIED_TABLE },
  { name: "organisation: probe by the notes in WHERE", statement: "select name from organisation where notes like '%x%'", expectedError: DENIED_TABLE },
  { name: "write: change the contact details of an organisation", statement: "update organisation set contact_name = 'x', contact_email = 'x@x.example', contact_phone = '12345', website = 'https://x.example', address = 'x', notes = 'x'", expectedError: DENIED_TABLE },
  { name: "write: change only the notes of an organisation", statement: "update organisation set notes = 'x'", expectedError: DENIED_TABLE },
  { name: "write: change a person's phone or job title", statement: "update member set phone = 'x', job_title = 'x'", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  // Phase 1 chunk C: the meeting emails switch is read through app_my_team only, and only a client manager writes it.
  { name: "member: the meeting emails switch", statement: "select meeting_emails from member", expectedError: DENIED_TABLE },
  { name: "write: change a person's meeting emails", statement: "update member set meeting_emails = false", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  { name: "write: add a partner agency without the function", statement: "insert into organisation (public_ref, kind, name) values ('ORG-ZZZZ', 'client', 'x')", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "write: change a person's role", statement: "update member set role = 'manager'", expectedError: DENIED_TABLE },
  // Phase 2: the going-live facts are Fynix's; an agency reads its own campaigns' flags through a function a client cannot call.
  { name: "campaign go-live state, for any campaign", statement: "select * from campaign_go_live_state(gen_random_uuid())", expectedError: /permission denied for function campaign_go_live_state/ },
  { name: "campaign readiness, as a client", statement: "select * from app_my_campaign_readiness()", expectedError: /permission denied for function app_my_campaign_readiness/, roles: ["leads_client"] },
  { name: "write: accept the agreement for the other side", statement: "insert into agreement_acceptance (agreement_id, user_id, network_address, side) values (gen_random_uuid(), gen_random_uuid(), 'x', 'supplier')", expectedError: /row-level security|violates foreign key|permission denied/, roles: ["leads_client"] },
  { name: "write: change an alias's client to anyone", statement: "update alias_identity set client_org_id = gen_random_uuid()", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "aliases: verification code hash", statement: "select verification_code_hash from alias_identity", expectedError: DENIED_TABLE },
  // Phase 3: the client decides after the meeting. The supply side sees the note as from the client, never the person; nobody forges an answer.
  { name: "lead: the person who decided, as the coordinator or an agency", statement: "select decision_by_user_id from lead", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  { name: "write: forge a decision as the coordinator or an agency", statement: "update lead set decision_note = 'x', decision_source = 'client'", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  { name: "lead: the organisation that sent it, as a client", statement: "select source_org_id from lead", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "meeting: the person who recorded the outcome", statement: "select recorded_by_user_id from meeting", expectedError: DENIED_TABLE },
  { name: "lead reminders", statement: "select * from lead_reminder", expectedError: DENIED_TABLE },
  { name: "write: stamp a reminder as sent", statement: "update lead_reminder set sent_at = now()", expectedError: DENIED_TABLE },
  { name: "the sweep, as a tenant", statement: "select * from app_sweep_leads(now())", expectedError: /permission denied for function app_sweep_leads/ },
  { name: "the due reminders, as a tenant", statement: "select * from app_due_lead_reminders(now())", expectedError: /permission denied for function app_due_lead_reminders/ },
  { name: "the alias of a lead, as an agency", statement: "select * from app_lead_alias_name(gen_random_uuid())", expectedError: /permission denied for function app_lead_alias_name/, roles: ["leads_agency"] },
  // Phase 4: drafts, postponing, contesting and review requests. A draft is hidden by policy; the person behind a proposal or a request is never granted.
  { name: "meeting proposals, every column", statement: "select * from meeting_reschedule", expectedError: DENIED_TABLE },
  { name: "meeting proposals: the person who proposed", statement: "select proposed_by_user_id from meeting_reschedule", expectedError: DENIED_TABLE },
  { name: "write: rewrite a proposal's times", statement: "update meeting_reschedule set proposed_times = '[]'::jsonb", expectedError: DENIED_TABLE },
  { name: "review requests, every column", statement: "select * from rejection_review", expectedError: DENIED_TABLE },
  { name: "review requests: the person who asked", statement: "select requested_by_user_id from rejection_review", expectedError: DENIED_TABLE },
  { name: "review requests, as a client", statement: "select id from rejection_review", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "write: resolve a review request", statement: "update rejection_review set status = 'resolved', resolved_at = now()", expectedError: DENIED_TABLE },
  { name: "lead: whether Fynix reviewed a rejection, as a client", statement: "select rejection_reviewed_at from lead", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "write: release a draft, as a client", statement: "update lead set released = true", expectedError: DENIED_TABLE, roles: ["leads_client"] },
  { name: "the host names of a campaign, as a client", statement: "select * from app_campaign_host_names(gen_random_uuid())", expectedError: /permission denied for function app_campaign_host_names/, roles: ["leads_client"] },
  { name: "the team of a campaign, as a client", statement: "select * from app_campaign_team(gen_random_uuid())", expectedError: /permission denied for function app_campaign_team/, roles: ["leads_client"] },
  { name: "whether an agency serves a member, as a client", statement: "select app_agency_serves_member(gen_random_uuid())", expectedError: /permission denied for function app_agency_serves_member/, roles: ["leads_client"] },
  { name: "invitations to meetings, every column", statement: "select * from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "invitations: who was invited", statement: "select member_id from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "invitations: the reply link hash", statement: "select reply_token_hash from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "write: invite someone to a meeting", statement: "insert into meeting_attendee (meeting_id, member_id) values (gen_random_uuid(), gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: change a reply", statement: "update meeting_attendee set reply = 'accepted'", expectedError: DENIED_TABLE },
  { name: "meeting: when someone must reply", statement: "select reply_due_at from meeting", expectedError: DENIED_TABLE },
  { name: "meeting: when it was confirmed", statement: "select confirmed_at from meeting", expectedError: DENIED_TABLE },
  { name: "who may read a client's team, called directly", statement: "select app_may_read_team(gen_random_uuid())", expectedError: /permission denied for function app_may_read_team/ },
  { name: "calendar: connection tokens", statement: "select refresh_token_enc from calendar_connection", expectedError: DENIED_TABLE },
  { name: "calendar: synced busy times", statement: "select starts_at from member_busy", expectedError: DENIED_TABLE },
  { name: "calendar: break someone's connection", statement: "delete from calendar_connection", expectedError: DENIED_TABLE },
  { name: "calendar: the warnings, as a tenant", statement: "select * from app_calendar_warnings()", expectedError: /permission denied for function app_calendar_warnings/, roles: ["leads_client", "leads_agency"] },
  { name: "calendar: someone's connections, as an agency", statement: "select * from app_my_calendar_connections()", expectedError: /permission denied for function app_my_calendar_connections/, roles: ["leads_agency"] },
  { name: "calendar: write a broken-connection notice, as a tenant", statement: "select app_calendar_connection_broken(gen_random_uuid(), 'google')", expectedError: /permission denied for function app_calendar_connection_broken/ },
  { name: "remind invited people, as a tenant", statement: "select app_remind_invitations(now())", expectedError: /permission denied for function app_remind_invitations/ },
  { name: "invite people to a meeting, as a client", statement: "select app_invite_attendees(gen_random_uuid(), array[gen_random_uuid()], array['x'])", expectedError: /permission denied for function app_invite_attendees/, roles: ["leads_client"] },
  { name: "answer an invitation, as an agency", statement: "select * from app_reply_invitation(gen_random_uuid(), 'accepted', null, null)", expectedError: /permission denied for function app_reply_invitation/, roles: ["leads_agency"] },
  { name: "the invitations of a person, as an agency", statement: "select * from app_my_invitations()", expectedError: /permission denied for function app_my_invitations/, roles: ["leads_agency"] },
  { name: "let go of lapsed invitations, as a tenant", statement: "select * from app_expire_invitations(now())", expectedError: /permission denied for function app_expire_invitations/ },
  { name: "the people of a client by its id", statement: "select * from app_team_people(gen_random_uuid())", expectedError: /permission denied for function app_team_people/ },
  { name: "the busy time of a client by its id", statement: "select * from app_team_busy(gen_random_uuid(), now(), now() + interval '1 day')", expectedError: /permission denied for function app_team_busy/ },
  { name: "the client behind a campaign", statement: "select app_team_client(gen_random_uuid())", expectedError: /permission denied for function app_team_client/ },
  { name: "who serves a lead, as a client", statement: "select app_lead_served_by_me(gen_random_uuid())", expectedError: /permission denied for function app_lead_served_by_me/, roles: ["leads_client"] },
  { name: "the visibility of a proposal to the supply side, as a client", statement: "select app_reschedule_visible_to_supply(gen_random_uuid())", expectedError: /permission denied for function app_reschedule_visible_to_supply/, roles: ["leads_client"] },
  { name: "the visibility of a proposal to the client, as an agency", statement: "select app_reschedule_visible_to_client(gen_random_uuid())", expectedError: /permission denied for function app_reschedule_visible_to_client/, roles: ["leads_agency"] },
  // Phase 5: only a function writes a notice for another person, and it checks the caller belongs to the lead or campaign it names.
  { name: "write: put a notice in front of another person", statement: "insert into notification (user_id, kind, title, body, link) values (gen_random_uuid(), 'general', 'x', 'x', '/')", expectedError: DENIED_TABLE },
  { name: "write: put a notice in front of another person, with a lead", statement: "insert into notification (user_id, kind, title, body, link, lead_id) values (gen_random_uuid(), 'general', 'x', 'x', '/', gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "the internal notice writer, as a tenant", statement: "select app_notice_insert(gen_random_uuid(), null, null, array['fynix'], 'general', 'x', 'x', 'lead', null)", expectedError: /permission denied for function app_notice_insert/ },
  { name: "a notice about a lead that is not mine", statement: "select app_notify_lead(gen_random_uuid(), array['fynix', 'client', 'source'], 'general', 'x', 'x')", expectedError: /domain:not-authorised/ },
  { name: "a notice about a campaign that is not mine", statement: "select app_notify_campaign(gen_random_uuid(), array['fynix'], 'general', 'x', 'x', 'campaign')", expectedError: /domain:not-authorised/ },
  { name: "the reminder sender, as a tenant", statement: "select * from app_send_lead_reminders(now())", expectedError: /permission denied for function app_send_lead_reminders/ },
  { name: "the groups that mix sides, as a tenant", statement: "select * from app_mixed_groups()", expectedError: /permission denied for function app_mixed_groups/ },
  { name: "the side root of a person, as a tenant", statement: "select app_side_root(gen_random_uuid())", expectedError: /permission denied for function app_side_root/ },
  // Phase 6: the privacy link and the prospect email switch are Fynix's to write and the client's to read; an agency reads neither. The room behind a link, the
  // calendar file's sequence and the import stamp are never granted; the join record has no id and no email; the reminders and the sweep's functions are the sweep's alone.
  { name: "campaign: the client's privacy link, as an agency", statement: "select client_privacy_url from campaign", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  { name: "campaign: whether prospect email is on, as an agency", statement: "select prospect_email_enabled from campaign", expectedError: DENIED_TABLE, roles: ["leads_agency"] },
  { name: "write: set the privacy link", statement: "update campaign set client_privacy_url = 'https://privacy.example/policy'", expectedError: DENIED_TABLE },
  { name: "write: switch prospect email on", statement: "update campaign set prospect_email_enabled = true", expectedError: DENIED_TABLE },
  // Migration 0089: the opening paragraph of the prospect letter is Fynix's alone, to read and to write.
  { name: "campaign: the letter's opening paragraph", statement: "select prospect_letter_opening from campaign", expectedError: DENIED_TABLE },
  { name: "write: set the letter's opening paragraph", statement: "update campaign set prospect_letter_opening = 'x'", expectedError: DENIED_TABLE },
  { name: "the letter's opening paragraph through its function, as a tenant", statement: "select app_prospect_letter_opening(gen_random_uuid(), 'prospect_confirmed')", expectedError: /permission denied for function app_prospect_letter_opening/ },
  { name: "meeting: the room behind the link", statement: "select google_space_id from meeting", expectedError: DENIED_TABLE },
  { name: "meeting: the calendar file's sequence", statement: "select ics_sequence from meeting", expectedError: DENIED_TABLE },
  { name: "meeting: whether the join record was read", statement: "select join_imported_at from meeting", expectedError: DENIED_TABLE },
  { name: "write: change the sequence of a calendar file", statement: "update meeting set ics_sequence = 99", expectedError: DENIED_TABLE },
  { name: "join record, every column", statement: "select * from meeting_join", expectedError: DENIED_TABLE },
  { name: "join record: the row id", statement: "select id from meeting_join", expectedError: DENIED_TABLE },
  { name: "write: add to the join record", statement: "insert into meeting_join (meeting_id, display_name, joined_at, duration_seconds) values (gen_random_uuid(), 'x', now(), 0)", expectedError: DENIED_TABLE },
  { name: "write: change a name in the join record", statement: "update meeting_join set display_name = 'x'", expectedError: DENIED_TABLE },
  { name: "meeting reminders, every column", statement: "select * from meeting_reminder", expectedError: DENIED_TABLE },
  // Migrations 0092 and 0093: the "sent once" keys are nobody's to read or write, the sweep's claims are the sweep's alone, and only Fynix queues a campaign email.
  { name: "the sent-once keys, every column", statement: "select * from once_stamp", expectedError: DENIED_TABLE },
  { name: "write: claim a sent-once key by hand", statement: "insert into once_stamp (key) values ('target:total:x')", expectedError: DENIED_TABLE },
  { name: "claim the targets a lead met, as the sweep would", statement: "select * from app_claim_target_notices_system(gen_random_uuid())", expectedError: /permission denied for function app_claim_target_notices_system/ },
  { name: "claim the targets of a lead that is not mine", statement: "select * from app_claim_target_notices(gen_random_uuid())", expectedError: /domain:not-authorised/ },
  { name: "claim the daily reminders, as a tenant", statement: "select * from app_claim_waiting_reminders(now())", expectedError: /permission denied for function app_claim_waiting_reminders/ },
  { name: "the list of leads a client is chased for, as a tenant", statement: "select * from app_leads_waiting(now())", expectedError: /permission denied for function app_leads_waiting/ },
  { name: "claim Fynix's daily summary, as a tenant", statement: "select * from app_claim_waiting_summary(now())", expectedError: /permission denied for function app_claim_waiting_summary/ },
  { name: "queue a campaign email, as a tenant", statement: "select app_enqueue_campaign_email(gen_random_uuid(), array['client_managers'], 'agreement_published_info', '{}'::jsonb, 's', 'b', 'https://x.example')", expectedError: /permission denied for function app_enqueue_campaign_email/ },
  { name: "write: stamp a meeting reminder as sent", statement: "update meeting_reminder set sent_at = now()", expectedError: DENIED_TABLE },
  { name: "lead reminders: the email stamp", statement: "select email_sent_at from lead_reminder", expectedError: DENIED_TABLE },
  { name: "the outbox, as a tenant", statement: "select recipient from email_outbox", expectedError: DENIED_TABLE },
  { name: "write: queue an email directly", statement: "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'meeting_booked', 's', 'b')", expectedError: DENIED_TABLE },
  { name: "the internal email writer, as a tenant", statement: "select app_email_enqueue(gen_random_uuid(), array['prospect'], 'prospect_confirmed', '{}'::jsonb, 's', 'b', 'https://x.example', null)", expectedError: /permission denied for function app_email_enqueue/ },
  { name: "an email about a lead that is not mine", statement: "select app_enqueue_lead_email(gen_random_uuid(), array['fynix'], 'lead_waiting', '{}'::jsonb, 's', 'b', 'https://x.example')", expectedError: /domain:not-authorised/ },
  { name: "the email context of a lead that is not mine", statement: "select * from app_lead_email_context(gen_random_uuid())", expectedError: /domain:not-authorised/ },
  { name: "the email context, as the sweep", statement: "select * from app_lead_email_context_system(gen_random_uuid())", expectedError: /permission denied for function app_lead_email_context_system/ },
  { name: "queue an email, as the sweep", statement: "select app_enqueue_lead_email_system(gen_random_uuid(), array['fynix'], 'lead_waiting', '{}'::jsonb, 's', 'b', 'https://x.example')", expectedError: /permission denied for function app_enqueue_lead_email_system/ },
  { name: "claim the client's reminder emails, as a tenant", statement: "select * from app_claim_reminder_emails(now())", expectedError: /permission denied for function app_claim_reminder_emails/ },
  { name: "claim the meeting reminders, as a tenant", statement: "select * from app_claim_meeting_reminders(now())", expectedError: /permission denied for function app_claim_meeting_reminders/ },
  { name: "the meetings whose room is to be read, as a tenant", statement: "select * from app_meetings_for_join_import(now())", expectedError: /permission denied for function app_meetings_for_join_import/ },
  { name: "store a join record, as a tenant", statement: "select app_store_meeting_joins(gen_random_uuid(), '[]'::jsonb, now())", expectedError: /permission denied for function app_store_meeting_joins/ },
];

/**
 * Every string in the world a viewer must not find, whether in a result or in an error message:
 * - every organisation id, the viewer's own included, because tenants never read an organisation id column (the one exception
 *   is the coordinator's own id, which it reads as the parent_org_id of its partner agencies);
 * - the reference and name of every other organisation, except that an agency may know the name of the clients of the campaigns it serves
 *   (a client has one name; nothing else of it);
 * - every campaign's internal notes, and the id, reference and name of every campaign that is not the viewer's.
 */
export function forbiddenTokens(viewer: Viewer, world: SeedWorld): string[] {
  const own = ownCampaigns(viewer, world);
  const nameVisibleFor = new Set(viewer.role === "leads_agency" ? own.map((row) => row.client.id) : []);
  const ownIdVisible = viewer.role === "leads_agency" && world.setup !== null && viewer.organisation.id === world.brightpath.id;
  const tokens: string[] = [];
  for (const org of [world.fynix, ...world.clients, ...world.agencies]) {
    // The coordinator reads parent_org_id on its partner agencies (migration 0032), which is its own id; no tenant reads an organisation.id column.
    if (!(org.id === viewer.organisation.id && ownIdVisible)) tokens.push(org.id);
    if (org.id === viewer.organisation.id) continue;
    tokens.push(org.publicRef);
    if (!nameVisibleFor.has(org.id)) tokens.push(org.name);
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
  // Phase 1 chunk A: a person's job title and phone are read inside their own organisation only; a client's profile only by the client and the sides
  // that serve it; removed collateral by nobody.
  for (const person of world.users) {
    if (person.organisation.id !== viewer.organisation.id) tokens.push(person.jobTitle, person.phone);
  }
  const visible = new Set(visibleProfiles(viewer, world));
  for (const profile of world.profiles) {
    tokens.push(profile.removedTitle);
    if (!visible.has(profile)) tokens.push(profile.introduction, profile.services, profile.differentiator, profile.caseStudies, profile.collateralTitle, profile.collateralUrl);
    if (viewer.role === "leads_agency" || viewer.organisation.id !== profile.client.id) tokens.push(profile.timeZone);
  }
  // Phase 1C: no tenant role reads an invite, an alias, an acceptance, the audit log or the outbox. Phase 1E gives each
  // tenant its own acceptances and its own alias, and narrows this to the other side's.
  const { domain } = world;
  if (domain !== null) {
    for (const row of domain.invites) tokens.push(row.id, row.email, row.name, row.token, row.tokenHash);
    tokens.push(...domain.aliases, ...domain.acceptanceAddresses, ...domain.auditMarkers, domain.outboxRecipient, domain.outboxLink, ...Object.values(domain.termsDocumentIds));
  }
  // Phase 1D/1E: each tenant reads rows that are its own (coordinator reads partner agencies under it; other tenants do not).
  const { setup } = world;
  if (setup !== null) {
    const isParentCoordinator = viewer.organisation.id === world.brightpath.id;
    if (!isParentCoordinator && viewer.organisation.id !== setup.partner.id) {
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
