import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, RUNTIME_ROLES, TENANT_ROLES, urlVariable, type RoleName, type RuntimeRoleName, type TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { findLeaks } from "@/server/db/testing/leak-matrix";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import {
  creationPrivileges,
  definerFunctionsWithoutSearchPath,
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

  it("tenant roles hold no table-level privilege, only column grants", async () => {
    expect(await tenantTableLevelGrants(dbs.owner.db)).toEqual([]);
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
  member: ["leads_auth", "leads_fynix"],
  rate_limit: ["leads_public"],
  email_outbox: ["leads_auth", "leads_fynix", "leads_public"],
  audit_log: ["leads_fynix"],
  terms_document: ["leads_auth", "leads_fynix"],
  terms_acceptance: ["leads_auth", "leads_fynix"],
  invite: ["leads_auth", "leads_fynix"],
  agency_alias: ["leads_auth", "leads_fynix"],
};
/** The tables nobody but leads_auth touches. `user` is not one of them any more: Fynix reads four columns of it. */
const AUTH_TABLES = ["session", "account", "verification"] as const;

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

  it("member: leads_auth may add a row (an invite was redeemed) and never change one, and Fynix may change only status and display_name", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "member")).toEqual(["leads_auth", "leads_fynix"]);
    const column = async (role: string, privilege: string, name: string): Promise<boolean> =>
      (await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('${role}', 'public.member', '${name}', '${privilege}') as allowed`))).rows[0]?.allowed ?? false;
    expect(await column("leads_auth", "UPDATE", "org_id")).toBe(false);
    expect(await column("leads_auth", "UPDATE", "status")).toBe(false);
    expect(await column("leads_auth", "INSERT", "org_id")).toBe(true);
    expect(await grantedColumns(dbs.owner.db, "leads_fynix", "member")).toEqual(["id", "user_id", "org_id", "org_kind", "role", "display_name", "status", "created_at"]);
    for (const name of ["status", "display_name"]) expect(await column("leads_fynix", "UPDATE", name), name).toBe(true);
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
      tenantTableLevelGrants,
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

describe("tenant roles", () => {
  const scoped = (role: TenantRoleName) => ({ db: dbs.roles[role].db, scope: { orgId: role === "leads_client" ? world.kestrel.id : world.brightpath.id, userId: USER } });

  it.each(TENANT_ROLES)("%s: `select *` fails on every table it holds a column grant on, whichever tables exist", async (role) => {
    const { db, scope } = scoped(role);
    const withGrants: string[] = [];
    for (const table of await publicTables(dbs.owner.db)) {
      if ((await grantedColumns(dbs.owner.db, role, table)).length === 0) continue;
      withGrants.push(table);
      const message = await captureErrorText(queryAs(db, scope, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    expect(withGrants).toEqual(["campaign", "organisation"]);
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
    const hiddenColumn = role === "leads_client" ? "client_org_id" : "agency_org_id";
    const granted = await dbs.owner.db.execute<{ allowed: boolean }>(
      sql.raw(`select has_column_privilege('${role}', 'public.campaign', '${hiddenColumn}', 'SELECT') as allowed`),
    );
    expect(granted.rows).toEqual([{ allowed: false }]);
    const { db, scope } = scoped(role);
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
      expect(await queryAs(unscoped(role), null, `select ${columns.map(quoteIdentifier).join(", ")} from ${name}`), table).toEqual([]);
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
    ...[world.fynix, ...world.clients, ...world.agencies].flatMap((org) => [org.id, org.publicRef, org.name, org.brandName ?? ""]),
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
      "update organisation set name = 'changed'",
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
