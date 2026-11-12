import { Client } from "pg";
import { DATABASES, OWNER_ROLE, ROLE_NAMES, RUNTIME_ROLES, type RoleName } from "@/server/db/roles";

/**
 * Least privilege: login only. None of these roles can create databases or roles, bypass row-level security or
 * replicate. Row-level security applies to all of them because only `leads_owner` owns tables, and the app never
 * connects as the owner.
 */
const ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION";

/** The same server and credentials, another database. */
export function databaseUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates the six roles, or resets the attributes and password of one that exists, so the script can be run again.
 * Roles are cluster-wide: resetting a password changes it for every checkout that shares this Postgres server.
 */
export async function provisionRoles(admin: Client, passwords: Readonly<Record<RoleName, string>>): Promise<void> {
  for (const role of ROLE_NAMES) {
    const identifier = admin.escapeIdentifier(role);
    const password = admin.escapeLiteral(passwords[role]);
    const existing = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Created role ${role}`);
    } else {
      await admin.query(`ALTER ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Updated role ${role}; its password now matches this checkout's .env.local`);
    }
  }
}

/** Creates the database, owned by the owner role, unless it exists. Needs the roles first. */
export async function createDatabaseIfMissing(admin: Client, database: string): Promise<void> {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(database)} OWNER ${admin.escapeIdentifier(OWNER_ROLE)}`);
    console.log(`Created database ${database}, owned by ${OWNER_ROLE}`);
  }
}

/**
 * Makes an existing database safe, and is safe to run again:
 * - the owner role owns it, so migrations run as the owner and tables belong to it;
 * - PUBLIC loses every database privilege, so only the six roles can connect and nobody can create temporary tables;
 * - PUBLIC loses CREATE on the public schema, and the runtime roles get USAGE only;
 * - functions the owner creates later are not executable by PUBLIC unless a migration grants it.
 */
export async function hardenDatabase(adminUrl: string, database: string): Promise<void> {
  await withClient(adminUrl, async (admin) => {
    const name = admin.escapeIdentifier(database);
    await admin.query(`ALTER DATABASE ${name} OWNER TO ${admin.escapeIdentifier(OWNER_ROLE)}`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    for (const role of ROLE_NAMES) {
      await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${admin.escapeIdentifier(role)}`);
    }
  });
  await withClient(databaseUrl(adminUrl, database), async (client) => {
    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    for (const role of RUNTIME_ROLES) {
      await client.query(`GRANT USAGE ON SCHEMA public TO ${client.escapeIdentifier(role)}`);
    }
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${client.escapeIdentifier(OWNER_ROLE)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
  });
  console.log(`Hardened database ${database}`);
}

/** The roles script: roles first, then every database that already exists. */
export async function runRolesSetup(adminUrl: string, passwords: Readonly<Record<RoleName, string>>): Promise<void> {
  await withClient(adminUrl, (admin) => provisionRoles(admin, passwords));
  for (const database of Object.values(DATABASES)) {
    const exists = await withClient(adminUrl, async (admin) => (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])).rowCount !== 0);
    if (exists) await hardenDatabase(adminUrl, database);
  }
}

/** The create script: both databases, then the same hardening. Fails clearly when the roles are missing. */
export async function runDatabaseSetup(adminUrl: string): Promise<void> {
  for (const database of Object.values(DATABASES)) {
    await withClient(adminUrl, async (admin) => {
      const owner = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [OWNER_ROLE]);
      if (owner.rowCount === 0) throw new Error(`Role ${OWNER_ROLE} does not exist. Run "pnpm db:roles" first.`);
      await createDatabaseIfMissing(admin, database);
    });
    await hardenDatabase(adminUrl, database);
  }
}
