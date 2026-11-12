import { OWNER_ROLE, ROLE_NAMES } from "@/server/db/roles";

/** The one method the guards use, so a unit test can pass a fake. `pg`'s Pool and Client both fit. */
export interface Queryable {
  query<Row extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
}

/**
 * Migrations grant privileges to the six roles and must create every object as the owner. Refuse to run when a role is
 * missing, or when the connection is not the owner: a table created by a superuser would belong to the wrong role and
 * nothing could be granted on it later.
 */
export async function assertReadyToMigrate(db: Queryable): Promise<void> {
  const found = await db.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [[...ROLE_NAMES]]);
  const missing = ROLE_NAMES.filter((name) => !found.rows.some((row) => row.rolname === name));
  if (missing.length > 0) {
    throw new Error(`Missing database roles: ${missing.join(", ")}. Run "pnpm db:roles" before migrating.`);
  }
  const current = await db.query<{ current_user: string }>("SELECT current_user");
  const user = current.rows[0]?.current_user;
  if (user !== OWNER_ROLE) {
    throw new Error(`Migrations must run as ${OWNER_ROLE}, not ${user ?? "an unknown role"}. Check DATABASE_URL_OWNER.`);
  }
}
