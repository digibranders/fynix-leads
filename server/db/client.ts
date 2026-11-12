import "server-only";
import { getEnv } from "@/server/env";
import { createDatabase, type DatabaseHandle } from "@/server/db/pool";
import { urlVariable, type RuntimeRoleName } from "@/server/db/roles";

type Handles = Map<RuntimeRoleName, DatabaseHandle>;

/**
 * Kept on `globalThis`, not in module scope: `next dev` re-evaluates this module on a hot reload, and a module-level
 * map would start empty each time and orphan the pools the old one opened. Symbol.for finds the same key in every copy.
 */
const HANDLES_KEY = Symbol.for("fynix-leads.db.handles");
const registry = globalThis as typeof globalThis & { [HANDLES_KEY]?: Handles };

function handles(): Handles {
  return (registry[HANDLES_KEY] ??= new Map());
}

/**
 * The pool for one runtime role, opened on first use. Each role has its own pool and its own login, so the database
 * decides what a request may see by who connected, not by anything the app says afterwards.
 *
 * Do not query a tenant role's pool directly: with no scope set it returns nothing, and with a stale one it could
 * return the wrong organisation. Use `withOrgScope` from scope.ts, which sets the scope inside a transaction.
 */
export function getDatabase(role: RuntimeRoleName): DatabaseHandle {
  const existing = handles().get(role);
  if (existing !== undefined) return existing;
  const variable = urlVariable(role, "dev");
  const connectionString: string | undefined = getEnv()[variable];
  // pg falls back to the PG* environment variables for a missing string, which would log in as another role.
  if (connectionString === undefined || connectionString === "") {
    throw new Error(`${variable} is not set, so the ${role} pool cannot be opened`);
  }
  const handle = createDatabase(connectionString);
  handles().set(role, handle);
  return handle;
}

/** Ends every open pool, for a clean shutdown. */
export async function closeDatabases(): Promise<void> {
  const cache = handles();
  const open = [...cache.values()];
  cache.clear();
  await Promise.all(open.map((handle) => handle.close()));
}
