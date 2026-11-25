import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, RUNTIME_ROLES, TENANT_ROLES, urlVariable, type RoleName, type RuntimeRoleName, type TenantRoleName } from "@/server/db/roles";
import { auditLog, campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { findLeaks } from "@/server/db/testing/leak-matrix";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import { SETUP_TABLES as NEW_TABLES, SETUP_TENANT_GRANTS } from "@/server/db/testing/tenant-grants";
import {
  creationPrivileges,
  definerFunctionsWithoutSearchPath,
  AUDIT_EXEMPT_TABLES,
  fynixWritableTablesWithoutAdminTrigger,
  fynixWritableTablesWithoutAuditTrigger,
  grantsToPublic,
  grantedColumns,
  grantsWithoutPolicy,
  publicTables,
  quoteIdentifier,
  roleMemberships,
  roleProblems,
  rolesWithAnyPrivilege,
  scopeFunctionProblems,
  tablesWithoutRowLevelSecurity,
  tenantTableLevelGrants,
  viewsThatBypassRowLevelSecurity,
  type Executor,
} from "@/server/db/testing/structure";

/**
 * Structural tests. Every check reads the catalogs, so it covers each table, view, function and role that exists,
 * including ones later phases add. A check that finds nothing might be broken, so each also runs against a
 * deliberately broken object (created and rolled back inside a transaction) and must find it.
 */

let dbs: TestDatabases;
let admin: DatabaseHandle;
let world: SeedWorld;
const USER = "33333333-3333-4333-8333-333333333333";

beforeAll(() => {
  dbs = openTestDatabases();
  admin = createDatabase(getToolingEnv().DATABASE_URL_ADMIN, { max: 1 });
});
afterAll(async () => {
  await Promise.all([dbs?.closeAll(), admin?.close()]);
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

class Rollback extends Error {}

/** The only table-level privileges a tenant role may hold, as "role.table". Each is DELETE alone: DELETE has no column form. Adding one is a review decision. */
const DELETE_ONLY_TABLE_GRANTS: readonly string[] = ["leads_agency.campaign_share", "leads_client.exclusion_entry", "leads_client.host_block", "leads_client.host_hours"];

/** Tenant-visible tables that Fynix writes but that are not set-up: they carry the audit trigger and no `fynix_admin_required` trigger, by design. */
const NOT_SET_UP_TABLES: readonly string[] = ["lead", "lead_history", "meeting", "meeting_reschedule", "rejection_review", "conversation", "conversation_message", "notification"];

/** Runs `setup` and then `check` in one transaction that is always rolled back, so nothing is left behind. */
async function findInBrokenState(handle: DatabaseHandle, setup: readonly string[], check: (executor: Executor) => Promise<string[]>): Promise<string[]> {
  let found: string[] = [];
  try {
    await handle.db.transaction(async (tx) => {
      for (const statement of setup) await tx.execute(sql.raw(statement));
      found = await check(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return found;
}

describe("catalog checks hold on the migrated database", () => {
  it("row-level security is enabled on every table", async () => {
    expect(await tablesWithoutRowLevelSecurity(dbs.owner.db)).toEqual([]);
  });

  it("every view is security_invoker, and there are no materialized views", async () => {
    expect(await viewsThatBypassRowLevelSecurity(dbs.owner.db)).toEqual([]);
  });

  it("tenant roles hold no table-level privilege, only column grants, apart from the DELETE-only grants listed here", async () => {
    // DELETE has no column form, so these four tables carry a table-level DELETE (with a policy) and nothing else.
    expect(await tenantTableLevelGrants(dbs.owner.db)).toEqual([...DELETE_ONLY_TABLE_GRANTS].sort());
    for (const grant of DELETE_ONLY_TABLE_GRANTS) {
      const [role, table] = grant.split(".");
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const held = await dbs.owner.db.execute<{ held: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', '${privilege}') as held`));
        expect(held.rows, `${grant} ${privilege}`).toEqual([{ held: false }]);
      }
      const deletes = await dbs.owner.db.execute<{ held: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', 'DELETE') as held`));
      expect(deletes.rows, `${grant} DELETE`).toEqual([{ held: true }]);
    }
  });

  it("nothing is granted to PUBLIC: no relation, no column, no function", async () => {
    expect(await grantsToPublic(dbs.owner.db)).toEqual([]);
  });

  it("every role that holds a grant on a table has a policy for it", async () => {
    expect(await grantsWithoutPolicy(dbs.owner.db)).toEqual([]);
  });

  it("the six roles exist, can log in and are NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION", async () => {
    expect(await roleProblems(dbs.owner.db)).toEqual([]);
  });

  it("no role is a member of another, so none can SET ROLE through membership", async () => {
    expect(await roleMemberships(dbs.owner.db)).toEqual([]);
  });

  it("no runtime role can create objects or temporary tables", async () => {
    expect(await creationPrivileges(dbs.owner.db)).toEqual([]);
  });

  it("SECURITY DEFINER functions pin their search_path", async () => {
    expect(await definerFunctionsWithoutSearchPath(dbs.owner.db)).toEqual([]);
  });

  it("the scope functions stay inlinable", async () => {
    expect(await scopeFunctionProblems(dbs.owner.db)).toEqual([]);
  });
});

/**
 * Which runtime roles hold any privilege on each table. Every table must be listed, so adding a table without saying who
 * may touch it fails here. The four auth tables belong to leads_auth alone: a tenant role, leads_fynix and leads_public
 * holding any privilege on them is a failure, and widening this list is a deliberate change that shows up in review.
 */
const EXPECTED_ACCESS: Readonly<Record<string, readonly RuntimeRoleName[]>> = {
  organisation: ["leads_fynix", "leads_client", "leads_agency"],
  campaign: ["leads_fynix", "leads_client", "leads_agency"],
  // Phase 1C: Fynix reads four columns of `user`, so people can be listed and invited. Never the rest.
  user: ["leads_auth", "leads_fynix"],
  session: ["leads_auth"],
  account: ["leads_auth"],
  verification: ["leads_auth"],
  // Gate G1: the authenticator secret and backup codes (encrypted). leads_auth alone.
  two_factor: ["leads_auth"],
  member: ["leads_auth", "leads_fynix", "leads_client", "leads_agency"],
  rate_limit: ["leads_public"],
  email_outbox: ["leads_auth", "leads_fynix", "leads_public"],
  audit_log: ["leads_fynix"],
  terms_document: ["leads_auth", "leads_fynix"],
  terms_acceptance: ["leads_auth", "leads_fynix"],
  invite: ["leads_auth", "leads_fynix", "leads_client", "leads_agency"],
  agency_alias: ["leads_auth", "leads_fynix"],
  // Phase 1 chunk A: the client profile and its collateral (Fynix writes, the client and the agencies that serve it read):
  client_profile: ["leads_fynix", "leads_client", "leads_agency"],
  client_collateral: ["leads_fynix", "leads_client", "leads_agency"],
  // Phase 1E tenant access:
  agreement: ["leads_fynix", "leads_client", "leads_agency"],
  agreement_acceptance: ["leads_fynix", "leads_client", "leads_agency"],
  campaign_share: ["leads_fynix", "leads_agency"],
  campaign_host: ["leads_fynix", "leads_client", "leads_agency"],
  host_hours: ["leads_fynix", "leads_client", "leads_agency"],
  host_block: ["leads_fynix", "leads_client", "leads_agency"],
  alias_identity: ["leads_auth", "leads_fynix", "leads_agency"],
  // Phase 2 leads access:
  exclusion_entry: ["leads_fynix", "leads_client"],
  lead: ["leads_fynix", "leads_client", "leads_agency"],
  lead_history: ["leads_fynix", "leads_client", "leads_agency"],
  // Phase 3 meetings access:
  meeting: ["leads_fynix", "leads_client", "leads_agency"],
  // Phase 4 and 5 messaging and notifications:
  conversation: ["leads_fynix", "leads_client", "leads_agency"],
  conversation_message: ["leads_fynix", "leads_client", "leads_agency"],
  notification: ["leads_fynix", "leads_client", "leads_agency"],
  // Read receipts: no runtime role touches it. Two SECURITY DEFINER functions (0049) write and read it.
  conversation_read: [],
  // File attachment metadata: no runtime role touches it; four SECURITY DEFINER functions (0050) are the only way in and out.
  message_attachment: [],
  // Chat groups and their members: no runtime role touches them; the SECURITY DEFINER functions of 0051 are the only way in and out.
  chat_group: [],
  chat_group_member: [],
  // Reminders to the client after "meeting finished": a trigger writes them and two SECURITY DEFINER functions (0066) read them, for the sweep (leads_auth) alone.
  lead_reminder: [],
  // Phase 4: a proposal to move a meeting (both sides write it, Fynix reads) and the coordinator's request to review a rejection (Fynix resolves it).
  meeting_reschedule: ["leads_fynix", "leads_client", "leads_agency"],
  rejection_review: ["leads_fynix", "leads_agency"],
  // Phase 6: when the emails that depend on a meeting's time are due (a trigger writes it, a SECURITY DEFINER function claims it, for the sweep alone), and who joined
  // a meeting's room (written by a function for the sweep; the client, the agencies and Fynix read the rows of the meetings they can read).
  meeting_reminder: [],
  meeting_join: ["leads_fynix", "leads_client", "leads_agency"],
};
/** The tables nobody but leads_auth touches. `user` is not one of them any more: Fynix reads four columns of it. */
const AUTH_TABLES = ["session", "account", "verification", "two_factor"] as const;

describe("access matrix", () => {
  it("lists every table, and no table that does not exist", async () => {
    expect(Object.keys(EXPECTED_ACCESS).sort()).toEqual(await publicTables(dbs.owner.db));
  });

  it.each(Object.entries(EXPECTED_ACCESS))("%s is touched by exactly the roles the matrix names", async (table, roles) => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual([...roles].sort());
  });

  it.each(AUTH_TABLES)("only leads_auth touches the auth table %s", async (table) => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual(["leads_auth"]);
  });

  it("member: leads_auth may add a row (an invite was redeemed) and never change one, Fynix may change only status, display_name, job_title and phone, and tenant roles only read (a client manager also edits name, job title, phone and meeting emails, and reads the last through app_my_team)", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "member")).toEqual(["leads_agency", "leads_auth", "leads_client", "leads_fynix"]);
    for (const role of TENANT_ROLES) {
      expect(await grantedColumns(dbs.owner.db, role, "member"), role).toEqual(["id", "user_id", "org_id", "org_kind", "role", "display_name", "status", "created_at", "job_title", "phone"]);
      const writes = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_any_column_privilege('${role}', 'public.member', 'INSERT') or has_table_privilege('${role}', 'public.member', 'DELETE') as allowed`));
      expect(writes.rows, `${role} inserts or deletes member`).toEqual([{ allowed: false }]);
      const updatable = (await dbs.owner.db.execute<{ attname: string }>(sql.raw(`select attname from pg_attribute where attrelid = 'public.member'::regclass and attnum > 0 and not attisdropped and has_column_privilege('${role}', 'public.member', attname, 'UPDATE') order by attnum`))).rows.map((row) => row.attname);
      expect(updatable, `${role} updates member`).toEqual(role === "leads_client" ? ["display_name", "job_title", "phone", "meeting_emails"] : []);
    }
    const column = async (role: string, privilege: string, name: string): Promise<boolean> =>
      (await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('${role}', 'public.member', '${name}', '${privilege}') as allowed`))).rows[0]?.allowed ?? false;
    expect(await column("leads_auth", "UPDATE", "org_id")).toBe(false);
    expect(await column("leads_auth", "UPDATE", "status")).toBe(false);
    expect(await column("leads_auth", "INSERT", "org_id")).toBe(true);
    expect(await grantedColumns(dbs.owner.db, "leads_fynix", "member")).toEqual(["id", "user_id", "org_id", "org_kind", "role", "display_name", "status", "created_at", "job_title", "phone", "meeting_emails"]);
    for (const name of ["status", "display_name", "job_title", "phone"]) expect(await column("leads_fynix", "UPDATE", name), name).toBe(true);
    for (const name of ["user_id", "org_id", "org_kind", "role"]) expect(await column("leads_fynix", "UPDATE", name), name).toBe(false);
    expect(await column("leads_fynix", "INSERT", "org_id")).toBe(false);
  });

  it("user: leads_fynix reads id, name, email and created_at, and writes nothing", async () => {
    expect(await grantedColumns(dbs.owner.db, "leads_fynix", "user")).toEqual(["id", "name", "email", "created_at"]);
    const writes = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_any_column_privilege('leads_fynix', 'public."user"', 'INSERT') or has_any_column_privilege('leads_fynix', 'public."user"', 'UPDATE') or has_table_privilege('leads_fynix', 'public."user"', 'DELETE') as allowed`));
    expect(writes.rows).toEqual([{ allowed: false }]);
    for (const statement of ['select * from "user"', 'select email_verified from "user"', 'select image from "user"']) {
      expect(await captureErrorText(queryAs(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, statement)), statement).toContain('permission denied for table user');
    }
  });

  it("leads_public may add to the outbox and nothing else: it cannot read, change or remove what is queued", async () => {
    const db = dbs.roles.leads_public.db;
    await queryAs(db, null, "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')");
    for (const statement of ["select * from email_outbox", "select body from email_outbox", "update email_outbox set body = 'x'", "delete from email_outbox"]) {
      expect(await captureErrorText(queryAs(db, null, statement)), statement).toContain("permission denied for table email_outbox");
    }
  });

  it("every role other than leads_auth is refused each auth table, whatever it asks for", async () => {
    for (const role of RUNTIME_ROLES.filter((candidate) => candidate !== "leads_auth")) {
      const scope = role === "leads_client" ? { orgId: world.kestrel.id, userId: USER } : role === "leads_agency" ? { orgId: world.brightpath.id, userId: USER } : { orgId: null, userId: USER };
      for (const table of AUTH_TABLES) {
        for (const statement of [`select * from ${quoteIdentifier(table)}`, `select id from ${quoteIdentifier(table)}`, `delete from ${quoteIdentifier(table)}`]) {
          const message = await captureErrorText(queryAs(dbs.roles[role].db, scope, statement));
          expect(message, `${role}: ${statement}`).toContain(`permission denied for table ${table}`);
        }
      }
    }
  });
});

describe("each catalog check finds a deliberately broken object", () => {
  it("row-level security off", async () => {
    const found = await findInBrokenState(dbs.owner, ["create table public.broken_no_rls (id int)"], tablesWithoutRowLevelSecurity);
    expect(found).toEqual(["broken_no_rls"]);
  });

  it("a view without security_invoker, and a materialized view; but not security_invoker spelled on", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create view public.broken_view as select 1 as x",
        "create materialized view public.broken_matview as select 1 as x",
        "create view public.fine_view_on with (security_invoker = on) as select 1 as x",
        "create view public.fine_view_true with (security_invoker = true) as select 1 as x",
      ],
      viewsThatBypassRowLevelSecurity,
    );
    expect(found).toEqual(["broken_matview", "broken_view"]);
  });

  it("a table-level grant to a tenant role, but not a column grant", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_grants (id int, secret int)",
        "grant select on public.broken_grants to leads_client",
        "grant insert on public.broken_grants to leads_agency",
        "create table public.fine_grants (id int, secret int)",
        "grant select (id) on public.fine_grants to leads_client",
      ],
      async (executor) => (await tenantTableLevelGrants(executor)).filter((grant) => !DELETE_ONLY_TABLE_GRANTS.includes(grant)),
    );
    expect(found).toEqual(["leads_agency.broken_grants", "leads_client.broken_grants"]);
  });

  it("a grant to PUBLIC on a table, a column and a function", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_public_table (id int)",
        "grant select on public.broken_public_table to public",
        "create table public.broken_public_column (id int)",
        "grant select (id) on public.broken_public_column to public",
        "create function public.broken_public_fn() returns int language sql as 'select 1'",
        "grant execute on function public.broken_public_fn() to public",
      ],
      grantsToPublic,
    );
    expect(found).toEqual(["broken_public_column.id", "broken_public_fn()", "broken_public_table"]);
  });

  it("a grant with no policy", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_no_policy (id int)",
        "alter table public.broken_no_policy enable row level security",
        "grant select (id) on public.broken_no_policy to leads_client",
      ],
      grantsWithoutPolicy,
    );
    expect(found).toEqual(["leads_client.broken_no_policy"]);
  });

  it("a table Fynix can write with no audit trigger, a trigger that is not deferred, and the two exempt tables", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_unaudited (id int)",
        "grant insert on public.broken_unaudited to leads_fynix",
        "create table public.broken_not_deferred (id int)",
        "grant update (id) on public.broken_not_deferred to leads_fynix",
        "create trigger broken_not_deferred_audit after insert or update on public.broken_not_deferred for each row execute function public.audit_required()",
        "create table public.fine_audited (id int)",
        "grant insert, update on public.fine_audited to leads_fynix",
        "create constraint trigger fine_audited_audit after insert or update on public.fine_audited deferrable initially deferred for each row execute function public.audit_required()",
        "create table public.fine_read_only (id int)",
        "grant select on public.fine_read_only to leads_fynix",
      ],
      (executor) => fynixWritableTablesWithoutAuditTrigger(executor, ["audit_log"]),
    );
    expect(found).toEqual(["broken_not_deferred", "broken_unaudited", "email_outbox"]);
  });

  it("a table Fynix can write with no admin trigger, a row level admin trigger, and the two exempt tables", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_no_admin (id int)",
        "grant insert on public.broken_no_admin to leads_fynix",
        "create table public.broken_row_admin (id int)",
        "grant update (id) on public.broken_row_admin to leads_fynix",
        "create trigger broken_row_admin_t before insert or update or delete on public.broken_row_admin for each row execute function public.fynix_admin_required()",
        "create table public.fine_admin (id int)",
        "grant insert, update on public.fine_admin to leads_fynix",
        "create trigger fine_admin_t before insert or update or delete on public.fine_admin for each statement execute function public.fynix_admin_required()",
        "create table public.fine_admin_read_only (id int)",
        "grant select on public.fine_admin_read_only to leads_fynix",
      ],
      (executor) => fynixWritableTablesWithoutAdminTrigger(executor, ["audit_log", ...NOT_SET_UP_TABLES]),
    );
    expect(found).toEqual(["broken_no_admin", "broken_row_admin", "email_outbox"]);
  });

  it("a role with CREATEDB, a stray leads_ role, and a membership (as superuser, rolled back)", async () => {
    const attributes = await findInBrokenState(admin, ["alter role leads_public createdb", "create role leads_stray"], roleProblems);
    expect(attributes).toEqual(["leads_public has a forbidden attribute", "leads_stray is not one of the six roles"]);
    const memberships = await findInBrokenState(admin, ["grant leads_client to leads_agency"], roleMemberships);
    expect(memberships).toEqual(["leads_client has member leads_agency"]);
  });

  it("any privilege on a table, at table or column level, for a role the matrix does not expect", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_access (a int, b int)",
        "grant insert (a) on public.broken_access to leads_client",
        "grant truncate on public.broken_access to leads_agency",
        "grant select (b) on public.broken_access to leads_public",
        "grant references (a) on public.broken_access to leads_fynix",
      ],
      (executor) => rolesWithAnyPrivilege(executor, "broken_access"),
    );
    expect(found).toEqual(["leads_agency", "leads_client", "leads_fynix", "leads_public"]);
  });

  it("CREATE on the schema and TEMPORARY on the database", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "grant create on schema public to leads_client",
        "do $$ begin execute format('grant temporary on database %I to leads_agency', current_database()); end $$",
      ],
      creationPrivileges,
    );
    expect(found).toEqual(["leads_agency can create temporary tables", "leads_client can create in schema public"]);
  });

  it("a SECURITY DEFINER function without a pinned search_path, but not one with it", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create function public.broken_definer() returns int language sql security definer as 'select 1'",
        "create function public.fine_definer() returns int language sql security definer set search_path = pg_catalog, public as 'select 1'",
      ],
      definerFunctionsWithoutSearchPath,
    );
    expect(found).toEqual(["broken_definer"]);
  });

  it("a scope function that gains a SET clause and so stops being inlinable", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      ["create or replace function public.app_current_org_id() returns uuid language sql stable set search_path = pg_catalog as $$ select null::uuid $$"],
      scopeFunctionProblems,
    );
    expect(found).toEqual(["app_current_org_id"]);
  });
});

describe("the audit log", () => {
  const fynix = (): { readonly db: Database; readonly scope: { readonly orgId: null; readonly userId: string } } => {
    const actor = world.users[0]?.id;
    if (actor === undefined) throw new Error("The seed world has no Fynix user");
    return { db: dbs.roles.leads_fynix.db, scope: { orgId: null, userId: actor } };
  };
  const auditCount = async (): Promise<number> => (await dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log`)).rows[0]?.n ?? 0;
  const organisationCount = async (): Promise<number> => (await dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from organisation`)).rows[0]?.n ?? 0;
  const newOrganisation = { publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" } as const;

  it("every table Fynix can write has the audit_required trigger, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAuditTrigger(dbs.owner.db)).toEqual([]);
  });

  it("every set-up table Fynix can write has the fynix_admin_required trigger, apart from the audit log, the outbox and the work tables", async () => {
    // The work tables (leads, meetings, messages, notifications) are written by Fynix staff in the course of the work, so they carry the audit trigger only.
    expect(await fynixWritableTablesWithoutAdminTrigger(dbs.owner.db, [...AUDIT_EXEMPT_TABLES, ...NOT_SET_UP_TABLES])).toEqual([]);
  });

  it("holds no UPDATE, DELETE or TRUNCATE for any runtime role, and only Fynix may read or append", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "audit_log")).toEqual(["leads_fynix"]);
    for (const role of RUNTIME_ROLES) {
      for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
        const held = await dbs.owner.db.execute<{ held: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.audit_log', '${privilege}') or has_any_column_privilege('${role}', 'public.audit_log', 'UPDATE') as held`));
        expect(held.rows, `${role} ${privilege}`).toEqual([{ held: false }]);
      }
    }
  });

  it("refuses UPDATE and DELETE even for the owner, and leaves the rows as they were", async () => {
    const before = await auditCount();
    expect(before).toBeGreaterThan(0);
    expect(await captureErrorText(dbs.owner.db.execute(sql`update audit_log set action = 'x.y'`))).toContain("audit_log is append only: UPDATE is not allowed");
    expect(await captureErrorText(dbs.owner.db.execute(sql`delete from audit_log`))).toContain("audit_log is append only: DELETE is not allowed");
    expect(await auditCount()).toBe(before);
  });

  it("a Fynix change with no audit row cannot commit, and nothing of it is left behind", async () => {
    const { db, scope } = fynix();
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.insert(organisation).values(newOrganisation)));
    expect(message).toContain("A change to organisation by Fynix has no audit_log row in its transaction");
    expect(await organisationCount()).toBe(5);
  });

  it("a Fynix change with an audit row commits, whichever of the two is written first", async () => {
    const { db, scope } = fynix();
    const entry = { action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId } as const;
    await withScope(db, scope, async (tx) => {
      await tx.insert(auditLog).values(entry);
      await tx.insert(organisation).values(newOrganisation);
    });
    await withScope(db, scope, async (tx) => {
      await tx.insert(organisation).values({ ...newOrganisation, publicRef: "ORG-3C4E" });
      await tx.insert(auditLog).values(entry);
    });
    expect(await organisationCount()).toBe(7);
  });

  it("a Fynix transaction that only reads needs no audit row", async () => {
    const { db, scope } = fynix();
    expect(await withScope(db, scope, (tx) => tx.select({ id: organisation.id }).from(organisation))).toHaveLength(5);
  });

  it("the owner's writes need none: seeds and `pnpm admin:create` are not Fynix actions", async () => {
    await dbs.owner.db.insert(organisation).values(newOrganisation);
    expect(await organisationCount()).toBe(6);
  });

  it("an audit row cannot be written in another person's name or from another role", async () => {
    const { db, scope } = fynix();
    const other = world.users[1]?.id ?? "";
    const named = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId, actorUserId: other })));
    expect(named).toContain('new row violates row-level security policy for table "audit_log"');
    const role = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId, actorRole: "leads_owner" })));
    expect(role).toContain('new row violates row-level security policy for table "audit_log"');
  });

  it("an audit row takes its actor and role from the request and the connection when none is named", async () => {
    const { db, scope } = fynix();
    await withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId }));
    const rows = await dbs.owner.db.execute<{ actor_user_id: string; actor_role: string }>(sql`select actor_user_id, actor_role from audit_log order by at desc limit 1`);
    expect(rows.rows).toEqual([{ actor_user_id: scope.userId, actor_role: "leads_fynix" }]);
  });

  it("refuses an action that is not in the table.verb form", async () => {
    const { db, scope } = fynix();
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "Delete Everything", subjectTable: "organisation", subjectId: scope.userId })));
    expect(message).toContain("audit_log_action_format");
  });
});

describe("tenant roles", () => {
  const scoped = (role: TenantRoleName) => ({ db: dbs.roles[role].db, scope: { orgId: role === "leads_client" ? world.kestrel.id : world.brightpath.id, userId: USER } });

  it.each(TENANT_ROLES)("%s: `select *` fails on every table it holds a column grant on but not every column, whichever tables exist", async (role) => {
    const { db, scope } = scoped(role);
    const partial: string[] = [];
    for (const table of await publicTables(dbs.owner.db)) {
      const granted = await grantedColumns(dbs.owner.db, role, table);
      if (granted.length === 0) continue;
      const total = await dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from pg_attribute where attrelid = to_regclass(format('public.%I', ${table}::text)) and attnum > 0 and not attisdropped`);
      // A role granted every column of a table may `select *` it: nothing is hidden from it.
      if (granted.length === (total.rows[0]?.n ?? -1)) continue;
      partial.push(table);
      const message = await captureErrorText(queryAs(db, scope, `select * from ${quoteIdentifier(table)}`));
      expect(message, table).toContain(`permission denied for table ${table}`);
    }
    expect(partial).toEqual(expect.arrayContaining(["campaign", "organisation", "lead", "agreement"]));
  });

  it.each(TENANT_ROLES)("%s: a Drizzle select with no column list fails the same way", async (role) => {
    const { db, scope } = scoped(role);
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.select().from(campaign)));
    expect(message).toContain("permission denied for table campaign");
  });

  it.each(TENANT_ROLES)("%s: count(*) works and counts only its own rows", async (role) => {
    const { db, scope } = scoped(role);
    const rows = await queryAs(db, scope, "select count(*)::int as n from campaign");
    expect(rows).toEqual([{ n: 2 }]);
  });

  it.each(TENANT_ROLES)("%s: statistics views show nothing, so most-common-values cannot reveal hidden columns", async (role) => {
    await dbs.owner.db.execute(sql`analyze public.campaign`);
    await dbs.owner.db.execute(sql`analyze public.organisation`);
    const { db, scope } = scoped(role);
    expect(await queryAs(db, scope, "select * from pg_stats where schemaname = 'public'")).toEqual([]);
  });

  it.each(TENANT_ROLES)("%s: policies work although the role cannot read the column they compare", async (role) => {
    // Since migrations 0037 and 0039 each tenant role reads the campaign parent columns its policies compare, so the proof moves to
    // organisation.id: both organisation policies compare it and neither role may read it.
    const granted = await dbs.owner.db.execute<{ allowed: boolean }>(
      sql.raw(`select has_column_privilege('${role}', 'public.organisation', 'id', 'SELECT') as allowed`),
    );
    expect(granted.rows).toEqual([{ allowed: false }]);
    const { db, scope } = scoped(role);
    expect(await queryAs(db, scope, "select public_ref from organisation order by public_ref")).toHaveLength(role === "leads_client" ? 1 : 1);
    expect(await queryAs(db, scope, "select public_ref from campaign order by public_ref")).toHaveLength(2);
  });
});

describe("every role", () => {
  const unscoped = (role: RuntimeRoleName) => dbs.roles[role].db;
  it.each(TENANT_ROLES)("%s: no scope set returns zero rows from every table it can read, although they hold rows", async (role) => {
    let seededRows = 0;
    for (const table of await publicTables(dbs.owner.db)) {
      const columns = await grantedColumns(dbs.owner.db, role, table);
      if (columns.length === 0) continue;
      const name = quoteIdentifier(table);
      const seeded = await dbs.owner.db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${name}`));
      seededRows += seeded.rows[0]?.n ?? 0;
      const read = `select ${columns.map(quoteIdentifier).join(", ")} from ${name}`;
      expect(await queryAs(unscoped(role), null, read), table).toEqual([]);
    }
    expect(seededRows).toBeGreaterThan(0);
  });

  it.each(RUNTIME_ROLES)("%s: every table it holds no grant on is unreadable", async (role) => {
    let checked = 0;
    for (const table of await publicTables(dbs.owner.db)) {
      if (EXPECTED_ACCESS[table]?.includes(role)) continue;
      checked += 1;
      const message = await captureErrorText(queryAs(unscoped(role), null, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    // The access matrix says which tables a role may touch; the access matrix tests prove the database agrees.
    expect(checked).toBe(Object.values(EXPECTED_ACCESS).filter((roles) => !roles.includes(role)).length);
  });

  const pairs = RUNTIME_ROLES.flatMap((from) => ROLE_NAMES.filter((to) => to !== from).map((to) => [from, to] as [RuntimeRoleName, RoleName]));
  it.each(pairs)("%s cannot become %s with SET ROLE", async (from, to) => {
    const message = await captureErrorText(queryAs(unscoped(from), null, `set local role ${to}`));
    expect(message).toMatch(/permission denied to set role/);
  });

  it.each(pairs)("%s cannot become %s with SET SESSION AUTHORIZATION", async (from, to) => {
    const message = await captureErrorText(queryAs(unscoped(from), null, `set local session authorization ${to}`));
    expect(message).toMatch(/permission denied to set session authorization/);
  });

  it.each(TENANT_ROLES)("%s: a failed transaction clears the scope on a single-connection pool", async (role) => {
    const env = getToolingEnv();
    const single = createDatabase(env[urlVariable(role, "test")], { max: 1 });
    try {
        const orgId = role === "leads_client" ? world.kestrel.id : world.brightpath.id;
      const failure = await captureErrorText(
        withScope(single.db, { orgId, userId: USER }, async (tx) => {
          const inside = await tx.execute<{ id: string | null }>(sql`select current_setting('app.org_id', true) as id`);
          expect(inside.rows[0]?.id).toBe(orgId);
          throw new Error("work failed");
        }),
      );
      expect(failure).toContain("work failed");
      // The same single connection, straight afterwards: no scope, no rows.
      const after = await single.db.execute<{ id: string | null }>(sql`select current_setting('app.org_id', true) as id`);
      expect(after.rows[0]?.id ?? "").toBe("");
      expect(await queryAs(single.db, null, "select public_ref from campaign")).toEqual([]);
    } finally {
      await single.close();
    }
  });
});

describe("denied writes", () => {
  const everything = (): string[] => [
    ...[world.fynix, ...world.clients, ...world.agencies].flatMap((org) => [org.id, org.publicRef, org.name]),
    ...world.campaigns.flatMap((row) => [row.id, row.publicRef, row.name, row.internalNotes]),
  ].filter((token) => token !== "");

  it.each(TENANT_ROLES)("%s: insert, update, delete and truncate say permission denied and echo no row data", async (role) => {
    const db = dbs.roles[role].db;
    const scope = { orgId: role === "leads_client" ? world.kestrel.id : world.brightpath.id, userId: USER };
    const statements = [
      "insert into campaign (public_ref, name, client_org_id, agency_org_id, start_date, end_date, monthly_target, total_target) values ('CMP-0000', 'x', gen_random_uuid(), gen_random_uuid(), '2026-12-01', '2026-12-02', 1, 1)",
      "update campaign set name = 'changed'",
      "delete from campaign",
      "truncate campaign",
      // leads_agency may rename organisations its policy lets it see (UPDATE on name and status), so both roles are refused a column nobody changes.
      "update organisation set kind = 'client'",
    ];
    for (const statement of statements) {
      const message = await captureErrorText(queryAs(db, scope, statement));
      expect(message).toMatch(/permission denied for table (campaign|organisation)/);
      expect(findLeaks(message, everything())).toEqual([]);
    }
  });

  it("an update that is denied leaves the rows untouched", async () => {
    await captureErrorText(queryAs(dbs.roles.leads_client.db, { orgId: world.kestrel.id, userId: USER }, "update campaign set name = 'changed'"));
    const names = await dbs.owner.db.execute<{ name: string }>(sql`select name from campaign order by name`);
    expect(names.rows.map((row) => row.name)).toEqual(world.campaigns.map((row) => row.name).sort());
  });
});

describe("phase 1D: what a tenant role holds on the six set-up tables", () => {
  const columnsWith = async (role: string, table: string, privilege: "SELECT" | "INSERT" | "UPDATE"): Promise<string[]> =>
    (await dbs.owner.db.execute<{ name: string }>(sql`select a.attname::text as name from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I', ${table}::text)) and a.attnum > 0 and not a.attisdropped
        and has_column_privilege(${role}::text, a.attrelid, a.attnum, ${privilege}) order by a.attnum`)).rows.map((row) => row.name);
  const allColumns = async (table: string): Promise<string[]> =>
    (await dbs.owner.db.execute<{ name: string }>(sql`select a.attname::text as name from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I', ${table}::text)) and a.attnum > 0 and not a.attisdropped order by a.attnum`)).rows.map((row) => row.name);

  it.each(TENANT_ROLES)("%s holds exactly the listed column grants on the six set-up tables, and nothing on the rest of them", async (role) => {
    for (const table of NEW_TABLES) {
      const expected = SETUP_TENANT_GRANTS[role][table];
      const columns = await allColumns(table);
      const label = `${role} ${table}`;
      if (expected === undefined) {
        expect(await rolesWithAnyPrivilege(dbs.owner.db, table), label).not.toContain(role);
        continue;
      }
      expect(await columnsWith(role, table, "SELECT"), `${label} reads`).toEqual(columns.filter((name) => !expected.unreadable.includes(name)));
      expect(await columnsWith(role, table, "UPDATE"), `${label} updates`).toEqual(expected.update);
      expect(await columnsWith(role, table, "INSERT"), `${label} inserts`).toEqual(expected.insertAll ? columns.filter((name) => !(expected.notInserted ?? []).includes(name)) : []);
      const deletes = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', 'DELETE') as allowed`));
      expect(deletes.rows, `${label} deletes`).toEqual([{ allowed: expected.delete }]);
    }
  });

  it.each(TENANT_ROLES)("%s reads the organisation and campaign columns listed here: the settings and the internal columns stay hidden", async (role) => {
    expect(await grantedColumns(dbs.owner.db, role, "organisation")).toEqual(role === "leads_agency" ? ["public_ref", "kind", "name", "parent_org_id"] : ["public_ref", "kind", "name", "time_zone"]);
    // client_org_id and agency_org_id are readable since migrations 0037 and 0039: the lead, meeting and message policies compare them.
    const campaignColumns = await grantedColumns(dbs.owner.db, role, "campaign");
    const basics = ["id", "public_ref", "name", "client_org_id", "agency_org_id", "status", "start_date", "end_date", "monthly_target", "total_target"];
    // Migrations 0054 and 0064: both tenant roles read the brief. Nobody but Fynix reads the notes or the settings.
    const brief = ["geography", "industries", "company_size", "icp", "job_titles", "seniority", "technologies", "bant_budget", "bant_authority", "bant_need", "bant_timeline", "instructions"];
    // Migration 0075: the client reads the privacy link of its campaigns and whether prospect email is on. An agency reads neither.
    const privacy = role === "leads_client" ? ["client_privacy_url", "prospect_email_enabled"] : [];
    expect([...campaignColumns].sort()).toEqual([...basics, ...brief, ...privacy].sort());
    for (const hidden of ["time_zone", "meeting_minutes", "internal_notes", ...(role === "leads_client" ? [] : ["client_privacy_url", "prospect_email_enabled"])]) expect(campaignColumns).not.toContain(hidden);
  });

  it("the Fynix role may write the new columns of organisation and campaign, which it holds table level grants on", async () => {
    for (const [table, column] of [["organisation", "parent_org_id"], ["campaign", "time_zone"], ["campaign", "meeting_minutes"]] as const) {
      const allowed = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('leads_fynix', 'public.${table}', '${column}', 'UPDATE') as allowed`));
      expect(allowed.rows, `${table}.${column}`).toEqual([{ allowed: true }]);
    }
  });

  it("the company contact details (migration 0080) are Fynix's alone: Fynix reads and writes them, no tenant role holds any privilege on them", async () => {
    const contact = ["contact_name", "contact_email", "contact_phone", "website", "address", "notes"];
    for (const column of contact) {
      for (const privilege of ["SELECT", "UPDATE", "INSERT"]) {
        const fynix = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('leads_fynix', 'public.organisation', '${column}', '${privilege}') as allowed`));
        expect(fynix.rows, `leads_fynix ${privilege} ${column}`).toEqual([{ allowed: true }]);
        for (const role of TENANT_ROLES) {
          const tenant = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('${role}', 'public.organisation', '${column}', '${privilege}') as allowed`));
          expect(tenant.rows, `${role} ${privilege} ${column}`).toEqual([{ allowed: false }]);
        }
      }
    }
  });

  it("every phase 1D table is in the access matrix with Fynix and exactly the tenant roles that hold a grant on it", () => {
    for (const table of NEW_TABLES) {
      const tenants = TENANT_ROLES.filter((role) => SETUP_TENANT_GRANTS[role][table] !== undefined);
      expect(EXPECTED_ACCESS[table], table).toEqual(["leads_fynix", ...tenants]);
    }
  });
});
