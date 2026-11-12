import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { RUNTIME_ROLES, ROLE_NAMES, TENANT_ROLES, type RoleName } from "@/server/db/roles";

/**
 * The structural checks. Each returns the offenders it found, so an empty list means the rule holds. They read the
 * system catalogs, so they cover every table, view, function and role in the public schema, including ones later
 * phases add, without anyone listing them. server/db/structure.integration.test.ts runs each one on the real
 * database and again on a deliberately broken one, to prove the check can fail.
 */

/** Anything that can run a statement: the owner database, or a transaction on it. */
export interface Executor {
  execute: Database["execute"];
}

const quoted = (names: readonly string[]): string => names.map((name) => `'${name}'`).join(", ");
const ALL_ROLES = quoted(ROLE_NAMES);
const RUNTIME = quoted(RUNTIME_ROLES);
const TENANTS = quoted(TENANT_ROLES);
const RELATION_KINDS = "('r', 'p', 'v', 'm', 'S')";

async function offenders(executor: Executor, query: SQL): Promise<string[]> {
  const result = await executor.execute<{ offender: string }>(query);
  return result.rows.map((row) => row.offender);
}

/** Tables with row-level security switched off. */
export function tablesWithoutRowLevelSecurity(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`,
  );
}

/**
 * Views that run with their owner's rights (the default) bypass row-level security, and a materialized view cannot be
 * made to do otherwise, so any of either is an offender. A view must say `WITH (security_invoker = true)`; Postgres
 * keeps the spelling it was given, so `on`, `true` and `1` all count.
 */
export function viewsThatBypassRowLevelSecurity(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and (c.relkind = 'm'
            or (c.relkind = 'v' and not exists (
                 select 1 from pg_options_to_table(c.reloptions) o
                 where o.option_name = 'security_invoker' and lower(o.option_value) in ('true', 'on', '1', 'yes', 't'))))
        order by 1`,
  );
}

/** "role.relation" for every table-level privilege a tenant role holds. Tenant roles may only hold column grants. */
export function tenantTableLevelGrants(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || '.' || c.relname as offender
      from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ${RELATION_KINDS} and r.rolname in (${TENANTS})
        and (has_table_privilege(r.oid, c.oid, 'SELECT') or has_table_privilege(r.oid, c.oid, 'INSERT')
          or has_table_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE')
          or has_table_privilege(r.oid, c.oid, 'TRUNCATE') or has_table_privilege(r.oid, c.oid, 'REFERENCES')
          or has_table_privilege(r.oid, c.oid, 'TRIGGER'))
      order by 1`),
  );
}

/** Anything granted to PUBLIC, which is every role: relations, columns and functions. Nothing may be. */
export function grantsToPublic(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) a
        where n.nspname = 'public' and c.relkind in ${RELATION_KINDS} and a.grantee = 0
      union all
      select c.relname || '.' || att.attname from pg_attribute att join pg_class c on c.oid = att.attrelid
        join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(att.attacl) a
        where n.nspname = 'public' and a.grantee = 0
      union all
      select p.proname || '()' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
      order by 1`),
  );
}

/** "role.table" for each role that can read or write a table but has no policy that applies to it. */
export function grantsWithoutPolicy(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || '.' || c.relname as offender
      from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ('r', 'p') and r.rolname in (${RUNTIME})
        and (has_any_column_privilege(r.oid, c.oid, 'SELECT') or has_any_column_privilege(r.oid, c.oid, 'INSERT')
          or has_any_column_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE'))
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid and (p.polroles = '{0}' or r.oid = any (p.polroles)))
      order by 1`),
  );
}

/** Role attribute problems, a missing role or a role that is not one of the six but is named like one. */
export function roleProblems(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select rolname::text || ' has a forbidden attribute' as offender from pg_roles
        where rolname in (${ALL_ROLES}) and (rolsuper or rolcreatedb or rolcreaterole or rolbypassrls or rolreplication or not rolcanlogin)
      union all
      select 'missing role ' || n from unnest(array[${ALL_ROLES}]) n where not exists (select 1 from pg_roles where rolname = n)
      union all
      select rolname::text || ' is not one of the six roles' from pg_roles where rolname like 'leads\\_%' and rolname not in (${ALL_ROLES})
      order by 1`),
  );
}

/** Role memberships that involve any of the six roles. There must be none: a member can `SET ROLE` to its group. */
export function roleMemberships(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select m.roleid::regrole::text || ' has member ' || m.member::regrole::text as offender from pg_auth_members m
        where m.roleid::regrole::text in (${ALL_ROLES}) or m.member::regrole::text in (${ALL_ROLES}) order by 1`),
  );
}

/** Runtime roles that may create objects or temporary tables. They may not: only the owner changes the schema. */
export function creationPrivileges(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || ' can ' || p.privilege as offender
      from pg_roles r cross join (values ('create in schema public'), ('create temporary tables'), ('create in the database')) p(privilege)
      where r.rolname in (${RUNTIME})
        and ((p.privilege = 'create in schema public' and has_schema_privilege(r.oid, 'public', 'CREATE'))
          or (p.privilege = 'create temporary tables' and has_database_privilege(r.oid, current_database(), 'TEMPORARY'))
          or (p.privilege = 'create in the database' and has_database_privilege(r.oid, current_database(), 'CREATE')))
      order by 1`),
  );
}

/** SECURITY DEFINER functions without a pinned search_path that starts with pg_catalog. */
export function definerFunctionsWithoutSearchPath(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select p.proname::text as offender from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=pg_catalog%')
        order by 1`,
  );
}

/** The scope functions must stay plain, STABLE, SQL and without a SET clause, or the planner stops inlining them into policies. */
export function scopeFunctionProblems(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select n::text as offender from unnest(array['app_current_org_id', 'app_current_user_id']) n
        where not exists (
          select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace join pg_language l on l.oid = p.prolang
          where s.nspname = 'public' and p.proname = n and l.lanname = 'sql' and p.provolatile = 's'
            and p.proconfig is null and not p.prosecdef)
        order by 1`,
  );
}

/** Every table in the public schema, so a test can loop over tables nobody has listed by hand. */
export async function publicTables(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
}

/** The columns of a public table that a role may SELECT. Empty when the role holds no column grant on it. */
export async function grantedColumns(executor: Executor, role: RoleName, table: string): Promise<string[]> {
  return offenders(
    executor,
    sql`select a.attname::text as offender from pg_attribute a
        where a.attrelid = to_regclass(format('public.%I', ${table}::text)) and a.attnum > 0 and not a.attisdropped
          and has_column_privilege(${role}::text, a.attrelid, a.attnum, 'SELECT')
        order by a.attnum`,
  );
}

/**
 * The runtime roles that hold any privilege on a public table, at table level or on any column: read, insert, update,
 * delete, truncate, references or trigger. The access matrix in structure.integration.test.ts compares this with what
 * each table is meant to allow, so a grant nobody intended shows up as a test failure naming the table and the role.
 */
export function rolesWithAnyPrivilege(executor: Executor, table: string): Promise<string[]> {
  return offenders(
    executor,
    sql`select r.rolname::text as offender
        from pg_roles r cross join lateral (select to_regclass(format('public.%I', ${table}::text)) as rel) t
        where r.rolname in (${sql.raw(RUNTIME)}) and t.rel is not null
          and (has_any_column_privilege(r.oid, t.rel, 'SELECT') or has_any_column_privilege(r.oid, t.rel, 'INSERT')
            or has_any_column_privilege(r.oid, t.rel, 'UPDATE') or has_any_column_privilege(r.oid, t.rel, 'REFERENCES')
            or has_table_privilege(r.oid, t.rel, 'DELETE') or has_table_privilege(r.oid, t.rel, 'TRUNCATE')
            or has_table_privilege(r.oid, t.rel, 'TRIGGER'))
        order by 1`,
  );
}

/**
 * Tables Fynix writes that are not covered by the audit rule. `audit_log` is where the rows go, and `email_outbox` is
 * plumbing: the invite email is queued in the same transaction as the invite, which is audited.
 */
export const AUDIT_EXEMPT_TABLES: readonly string[] = ["audit_log", "email_outbox"];

/**
 * Tables `leads_fynix` can insert into, update or delete from that have no enabled, deferred `audit_required` constraint
 * trigger on both INSERT and UPDATE. Without it a Fynix change could commit with no audit_log row, so every table Fynix
 * gets a write grant on (now or in a later phase) must add the trigger in its grants migration.
 */
export function fynixWritableTablesWithoutAuditTrigger(executor: Executor, exempt: readonly string[] = AUDIT_EXEMPT_TABLES): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in (${sql.raw(quoted(exempt.length === 0 ? [""] : exempt))})
          and (has_any_column_privilege('leads_fynix', c.oid, 'INSERT') or has_any_column_privilege('leads_fynix', c.oid, 'UPDATE')
            or has_table_privilege('leads_fynix', c.oid, 'DELETE'))
          and not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgrelid = c.oid and p.proname = 'audit_required' and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred
              and t.tgenabled = 'O' and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0)
        order by 1`,
  );
}

/** Quotes a catalog identifier for use in test SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
