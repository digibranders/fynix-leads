import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog, emailOutbox } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import { publishTerms } from "@/server/domain/terms";
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

/** Publishes approved (not placeholder) terms for every party, through the service, so invites can be issued and redeemed. */
export async function publishApprovedTerms(rig: DomainRig): Promise<void> {
  for (const party of ["client", "agency", "fynix"] as const) {
    await publishTerms(rig.deps(), rig.actor, { party, title: `Terms for ${party} users`, body: `The approved terms for ${party} users, version one.` });
  }
}

/** The link in the newest queued message for an address, which is where the token lives until the message is sent. */
export async function latestInviteLink(rig: DomainRig, email: string): Promise<{ readonly link: string; readonly token: string }> {
  const [row] = await rig.dbs.owner.db.select({ link: emailOutbox.link }).from(emailOutbox).where(eq(emailOutbox.recipient, email)).orderBy(desc(emailOutbox.createdAt)).limit(1);
  const token = row?.link == null ? null : new URL(row.link).searchParams.get("token");
  if (row?.link == null || token === null) throw new Error(`No invite link is queued for ${email}`);
  return { link: row.link, token };
}
