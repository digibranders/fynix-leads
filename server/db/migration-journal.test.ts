import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the migration journal without a database. The migrator applies a migration only when its `when` is greater
 * than the newest one already recorded, so an entry whose `when` is not above the one before it is silently skipped
 * on every database that has already run the earlier one. drizzle-kit writes `when` from the machine's clock: if that
 * clock is behind an entry already in the journal, edit the new entry's `when` by hand to a larger value.
 */

const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url));
const META = join(MIGRATIONS, "meta");

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}
interface Snapshot {
  readonly id: string;
  readonly prevId: string;
}

/**
 * Migrations that have no `meta/NNNN_snapshot.json`. Empty today: `drizzle-kit generate --custom` writes a snapshot for
 * hand-written SQL too, so every migration, written or generated, has one. Add a tag here only for SQL that really
 * could not get a snapshot, with a comment saying why. The list only shrinks.
 */
const WITHOUT_SNAPSHOT: ReadonlySet<string> = new Set([]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJournal(): JournalEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(join(META, "_journal.json"), "utf8"));
  const list = isRecord(parsed) ? parsed.entries : undefined;
  if (!Array.isArray(list)) throw new Error("The migration journal has no entries list.");
  return list.map((item: unknown): JournalEntry => {
    if (!isRecord(item) || typeof item.idx !== "number" || typeof item.when !== "number" || typeof item.tag !== "string") {
      throw new Error(`A migration journal entry is malformed: ${JSON.stringify(item)}`);
    }
    return { idx: item.idx, when: item.when, tag: item.tag };
  });
}

function readSnapshot(tag: string): Snapshot {
  const parsed: unknown = JSON.parse(readFileSync(join(META, `${tag.slice(0, 4)}_snapshot.json`), "utf8"));
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.prevId !== "string") {
    throw new Error(`The snapshot for ${tag} has no id and prevId.`);
  }
  return { id: parsed.id, prevId: parsed.prevId };
}

const entries = readJournal();
const number = (tag: string): number => Number(tag.slice(0, 4));

describe("migration journal", () => {
  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("numbers its entries from 0 without gaps", () => {
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
  });

  it("has strictly increasing `when` values, so no new migration can be skipped as already applied", () => {
    const offenders = entries.flatMap((entry, index) => {
      const previous = entries[index - 1];
      return previous !== undefined && entry.when <= previous.when ? [`${entry.tag} (${entry.when}) is not above ${previous.tag} (${previous.when})`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("names each tag with its migration number, in order, once", () => {
    expect(entries.every((entry) => /^\d{4}_[a-z0-9_]+$/.test(entry.tag))).toBe(true);
    expect(entries.map((entry) => number(entry.tag))).toEqual(entries.map((_, index) => index));
  });

  it("has a SQL file for every entry and no SQL file outside the journal", () => {
    const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -4)).sort();
    expect(files).toEqual(entries.map((entry) => entry.tag).sort());
  });

  it("has a snapshot for every entry except the whitelisted ones, and the whitelist has no stale names", () => {
    const missing = entries
      .filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag))
      .flatMap((entry) => {
        try {
          readSnapshot(entry.tag);
          return [];
        } catch {
          return [entry.tag];
        }
      });
    expect(missing).toEqual([]);
    expect([...WITHOUT_SNAPSHOT].filter((tag) => !entries.some((entry) => entry.tag === tag))).toEqual([]);
  });

  it("chains each snapshot to the one before it", () => {
    const chain = entries.filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag));
    const broken = chain.flatMap((entry, index) => {
      const previous = chain[index - 1];
      if (previous === undefined) return readSnapshot(entry.tag).prevId === "00000000-0000-0000-0000-000000000000" ? [] : [`${entry.tag} does not start the chain`];
      return readSnapshot(entry.tag).prevId === readSnapshot(previous.tag).id ? [] : [`${entry.tag} does not follow ${previous.tag}`];
    });
    expect(broken).toEqual([]);
  });
});
