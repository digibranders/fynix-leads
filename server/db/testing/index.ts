import { sql } from "drizzle-orm";
import { createDatabase, type Database, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, type RoleName, type RuntimeRoleName, RUNTIME_ROLES, urlVariable } from "@/server/db/roles";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";

export interface TestDatabases {
  /** Connects as `leads_owner`: bypasses row-level security, so it seeds and inspects. Tests never read data through it. */
  readonly owner: DatabaseHandle;
  /** One handle per runtime role, each logged in as that role on the test database. */
  readonly roles: Readonly<Record<RuntimeRoleName, DatabaseHandle>>;
  readonly closeAll: () => Promise<void>;
}

/**
 * Truncation is destructive, so refuse any URL that could reach something other than a database whose name ends in
 * `_test`. Returns the database name.
 */
export function testDatabaseName(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("A test database URL is not a valid URL (value hidden because it contains a password).");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Refusing a test database URL that is not postgres:// or postgresql://.");
  }
  if (url.searchParams.has("host")) {
    throw new Error("Refusing a test database URL with a host query parameter: it can redirect the connection.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to use "${database}" for tests: the database name must end with "_test".`);
  }
  return database;
}

/** Opens the owner and the five runtime roles on the test database, after checking that every URL names the same `_test` database. */
export function openTestDatabases(): TestDatabases {
  loadEnvLocal();
  const env = getToolingEnv();
  const urls = Object.fromEntries(ROLE_NAMES.map((role) => [role, env[urlVariable(role, "test")]])) as Record<RoleName, string>;

  const names = new Set(ROLE_NAMES.map((role) => testDatabaseName(urls[role])));
  if (names.size !== 1) {
    throw new Error(`Every test database URL must name the same database, found: ${[...names].join(", ")}`);
  }

  const owner = createDatabase(urls.leads_owner, { max: 2 });
  const roles = Object.fromEntries(RUNTIME_ROLES.map((role) => [role, createDatabase(urls[role], { max: 3 })])) as Record<RuntimeRoleName, DatabaseHandle>;
  return {
    owner,
    roles,
    closeAll: async () => {
      await Promise.all([owner.close(), ...Object.values(roles).map((handle) => handle.close())]);
    },
  };
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Empties every table in the public schema of a `_test` database. Tables added by later migrations are included. */
export async function resetDatabase(owner: DatabaseHandle): Promise<void> {
  const current = await owner.db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = current.rows[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to truncate "${name}": it is not a _test database.`);
  }
  const tables = await owner.db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);
  if (tables.rows.length === 0) return;
  const list = tables.rows.map((row) => `public.${quoteIdentifier(row.tablename)}`).join(", ");
  await owner.db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

const MAX_CAUSE_DEPTH = 10;

/** Drizzle wraps driver errors; this joins the cause chain so a test can match the Postgres message. */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  if (error.cause === undefined || depth >= MAX_CAUSE_DEPTH) return error.message;
  return `${error.message}\n${describeError(error.cause, depth + 1)}`;
}

/** The full error text of an operation that must fail. Fails the test if it succeeds. */
export async function captureErrorText(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the operation to fail, but it succeeded.");
}

/** The rows of a statement run as one role. `scope` null means no scope is set, which is how an unscoped request looks. */
export async function queryAs(db: Database, scope: { readonly orgId: string | null; readonly userId: string } | null, statement: string): Promise<Record<string, unknown>[]> {
  const run = async (tx: ScopedTransaction): Promise<Record<string, unknown>[]> => (await tx.execute(sql.raw(statement))).rows;
  // A transaction either way, so a statement that unexpectedly succeeds (SET ROLE, for one) cannot outlive the test.
  return scope === null ? db.transaction(run) : withScope(db, scope, run);
}
