import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MigrationFailedError, runMigrations } from "@/server/db/migrator";
import { openTestDatabases, type TestDatabases } from "@/server/db/testing";

/**
 * The migrator against a real database, in a throwaway schema of the test database (dropped afterwards), with
 * migrations written to a temporary folder. The real migrations are not involved.
 */

let dbs: TestDatabases;
const folders: string[] = [];
const schemas: string[] = [];

beforeAll(() => {
  dbs = openTestDatabases();
});
afterEach(async () => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  for (const schema of schemas.splice(0)) await dbs.owner.db.$client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
afterAll(async () => {
  await dbs?.closeAll();
});

/** A migration folder in drizzle-kit's layout: a journal and numbered SQL files. */
function writeMigrations(files: readonly { readonly tag: string; readonly sql: string }[]): string {
  const folder = mkdtempSync(join(tmpdir(), "migrator-"));
  folders.push(folder);
  mkdirSync(join(folder, "meta"));
  const entries = files.map((file, index) => ({ idx: index, version: "7", when: 1_800_000_000_000 + index * 1000, tag: file.tag, breakpoints: true }));
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  for (const file of files) writeFileSync(join(folder, `${file.tag}.sql`), file.sql);
  return folder;
}

function newSchema(): string {
  const schema = `migrator_probe_${randomBytes(4).toString("hex")}`;
  schemas.push(schema);
  return schema;
}

/** An enum value added in one migration and used in the next: the case a single transaction cannot run. */
function enumMigrations(schema: string): { tag: string; sql: string }[] {
  return [
    { tag: "0000_create", sql: `CREATE SCHEMA IF NOT EXISTS "${schema}";\n--> statement-breakpoint\nCREATE TYPE "${schema}".mood AS ENUM ('happy');\n--> statement-breakpoint\nCREATE TABLE "${schema}".entry (mood "${schema}".mood NOT NULL);` },
    { tag: "0001_add_value", sql: `ALTER TYPE "${schema}".mood ADD VALUE 'sad';` },
    { tag: "0002_use_value", sql: `INSERT INTO "${schema}".entry (mood) VALUES ('sad');` },
  ];
}

const rowCount = async (schema: string): Promise<number> => (await dbs.owner.db.$client.query(`SELECT count(*)::int AS n FROM "${schema}".entry`)).rows[0].n;
const applied = async (schema: string): Promise<number> => (await dbs.owner.db.$client.query(`SELECT count(*)::int AS n FROM "${schema}".__drizzle_migrations`)).rows[0].n;

describe("runMigrations", () => {
  it("commits each migration on its own, so an enum value can be added and used by the next migration", async () => {
    const schema = newSchema();
    await runMigrations(dbs.owner.db.$client, writeMigrations(enumMigrations(schema)), { bookkeepingSchema: schema });
    expect(await rowCount(schema)).toBe(1);
    expect(await applied(schema)).toBe(3);
  });

  it("is the reason the migrator exists: drizzle's own migrate() runs the same files in one transaction and fails", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    const message = await migrate(drizzle(dbs.owner.db.$client), { migrationsFolder: folder, migrationsSchema: schema }).then(
      () => "",
      (error: unknown) => String((error as { cause?: unknown }).cause ?? error),
    );
    expect(message).toMatch(/unsafe use of new value/);
  });

  it("applies nothing twice", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    expect(await applied(schema)).toBe(3);
    expect(await rowCount(schema)).toBe(1);
  });

  it("rolls back a failing migration by itself, keeps the earlier ones and applies nothing after it", async () => {
    const schema = newSchema();
    const files = [
      ...enumMigrations(schema).slice(0, 2),
      { tag: "0002_breaks", sql: `CREATE TABLE "${schema}".half_done (id int);\n--> statement-breakpoint\nSELECT 1/0;` },
      { tag: "0003_never_runs", sql: `CREATE TABLE "${schema}".never (id int);` },
    ];
    const failure = await runMigrations(dbs.owner.db.$client, writeMigrations(files), { bookkeepingSchema: schema }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(MigrationFailedError);
    expect((failure as MigrationFailedError).message).toContain("0002_breaks");
    expect((failure as MigrationFailedError).message).toContain("division by zero");
    expect(await applied(schema)).toBe(2);
    const tables = await dbs.owner.db.$client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`, [schema]);
    expect(tables.rows.map((row) => row.table_name)).toEqual(["__drizzle_migrations", "entry"]);
  });

  it("stops after the named migration and resumes from there", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema, stopAfter: "0001_add_value" });
    expect(await applied(schema)).toBe(2);
    expect(await rowCount(schema)).toBe(0);
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    expect(await rowCount(schema)).toBe(1);
  });

  it("rejects a stop-after tag that is not in the journal, before touching the database", async () => {
    const schema = newSchema();
    await expect(runMigrations(dbs.owner.db.$client, writeMigrations(enumMigrations(schema)), { bookkeepingSchema: schema, stopAfter: "0009_missing" })).rejects.toThrow(
      'stopAfter names "0009_missing"',
    );
  });
});
