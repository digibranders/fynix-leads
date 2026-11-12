import { asc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import type { DomainRig } from "@/server/domain/testing";

/** A random source that answers from a list, one entry per call, and repeats the last entry when the list runs out. For forcing a reference collision. */
export function scriptedBytes(script: readonly (readonly number[])[]): RandomBytes {
  let position = 0;
  return () => {
    const entry = script[Math.min(position, script.length - 1)];
    position += 1;
    if (entry === undefined) throw new Error("scriptedBytes needs at least one entry");
    return Uint8Array.from(entry);
  };
}

/** The audit rows written so far, oldest first, optionally for one action. Read as the owner, which can read everything. */
export function auditRowsFor(rig: DomainRig, action?: AuditAction) {
  const query = rig.dbs.owner.db.select(getTableColumns(auditLog)).from(auditLog);
  return (action === undefined ? query : query.where(eq(auditLog.action, action))).orderBy(asc(auditLog.at));
}
