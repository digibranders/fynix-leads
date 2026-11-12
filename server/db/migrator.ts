import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, PoolClient } from "pg";

/** Drizzle's own bookkeeping location. Keep it: drizzle-kit and drizzle-orm both expect it. */
const DEFAULT_SCHEMA = "drizzle";

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** A migration failed. It was rolled back on its own; every migration before it stays applied. */
export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    options: { readonly cause: unknown },
  ) {
    const reason = options.cause instanceof Error ? options.cause.message : String(options.cause);
    super(`Migration ${migration} failed and was rolled back; nothing after it was applied. ${reason}`, options);
    this.name = "MigrationFailedError";
  }
}

export interface MigrateOptions {
  /** Stop after applying the migration with this tag, for example `0001_organisation_campaign`. Later ones stay pending. */
  readonly stopAfter?: string;
  /** Where Drizzle's bookkeeping table lives. Only the migrator's own integration test changes it. */
  readonly bookkeepingSchema?: string;
}

/** The migration names, in order, from drizzle-kit's journal. Drizzle's own reader discards them. */
function readMigrationTags(migrationsFolder: string): readonly string[] {
  const journal: unknown = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  const entries = (journal as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error(`${migrationsFolder}/meta/_journal.json has no entries list.`);
  return entries.map((entry: unknown, index) => {
    const tag = (entry as { tag?: unknown }).tag;
    if (typeof tag !== "string") throw new Error(`Journal entry ${index} in ${migrationsFolder} has no tag.`);
    return tag;
  });
}

async function applyOne(client: PoolClient, statements: readonly string[], insert: string, hash: string, createdAt: number): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement);
    await client.query(insert, [hash, createdAt]);
    await client.query("COMMIT");
  } catch (error) {
    // A connection that has lost the transaction cannot roll back; the original error is the one worth reporting.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/**
 * Applies pending migrations the way drizzle-orm's migrator does (same files, same bookkeeping table and hashes, same
 * "newer than the last applied migration" rule) except that each migration commits on its own.
 *
 * Drizzle runs every pending migration in one transaction. Postgres refuses to use an enum value in the transaction
 * that added it (55P04, "unsafe use of new value"), so a database migrated from scratch can fail on a migration that
 * worked on every database that received the same migrations on different days. The sibling platform repository
 * found this when its first fresh production database failed. Committing per migration is what Rails and Flyway do.
 *
 * A failing migration is rolled back by itself and stops the run: everything before it stays applied, nothing after
 * it is attempted, and the error names it.
 */
export async function runMigrations(pool: Pool, migrationsFolder: string, options: MigrateOptions = {}): Promise<void> {
  const schema = quote(options.bookkeepingSchema ?? DEFAULT_SCHEMA);
  const table = `${schema}."__drizzle_migrations"`;
  const migrations = readMigrationFiles({ migrationsFolder });
  const tags = readMigrationTags(migrationsFolder);
  if (tags.length !== migrations.length) {
    throw new Error(`${migrationsFolder} lists ${tags.length} migrations in its journal but has ${migrations.length}.`);
  }
  if (options.stopAfter !== undefined && !tags.includes(options.stopAfter)) {
    throw new Error(`stopAfter names "${options.stopAfter}", which is not in ${migrationsFolder}/meta/_journal.json.`);
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    const last = await client.query<{ created_at: string | null }>(`SELECT created_at FROM ${table} ORDER BY created_at DESC LIMIT 1`);
    // Drizzle compares against the newest recorded migration only; keep the same rule so both runners agree.
    const lastApplied = last.rows[0] === undefined ? null : Number(last.rows[0].created_at);
    const insert = `INSERT INTO ${table} ("hash", "created_at") VALUES ($1, $2)`;

    for (const [index, migration] of migrations.entries()) {
      const tag = tags[index] ?? `#${index}`;
      if (lastApplied === null || lastApplied < migration.folderMillis) {
        try {
          await applyOne(client, migration.sql, insert, migration.hash, migration.folderMillis);
        } catch (error) {
          throw new MigrationFailedError(tag, { cause: error });
        }
      }
      if (tag === options.stopAfter) return;
    }
  } finally {
    client.release();
  }
}
