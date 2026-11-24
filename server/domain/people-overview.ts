import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { auditLog, invite, member, user } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";

/** A person on a Fynix screen: someone who has joined, or someone whose invite is still open. Fynix sees every email and phone. */
export interface PersonRow {
  readonly kind: "member" | "invite";
  /** The member id for a person, the invite id for an invite. */
  readonly id: string;
  /** The account, so a screen can stop an admin suspending themselves. Null for an invite. */
  readonly userId: string | null;
  readonly orgId: string;
  readonly orgName: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly role: "member" | "manager";
  readonly state: "active" | "suspended" | "invited" | "invite-expired";
}

/** The people of the given organisations: members by name, then open invites by name. Run inside a Fynix read. */
export async function readPeople(tx: ScopedTransaction, orgs: readonly { readonly id: string; readonly name: string }[], now: Date): Promise<readonly PersonRow[]> {
  if (orgs.length === 0) return [];
  const ids = orgs.map((org) => org.id);
  const nameOf = new Map(orgs.map((org) => [org.id, org.name]));
  const members = await tx
    .select({ id: member.id, userId: member.userId, orgId: member.orgId, name: member.displayName, jobTitle: member.jobTitle, email: user.email, phone: member.phone, role: member.role, status: member.status })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(inArray(member.orgId, ids))
    .orderBy(asc(member.displayName));
  const invites = await tx
    .select({ id: invite.id, orgId: invite.orgId, name: invite.name, jobTitle: invite.jobTitle, email: invite.email, phone: invite.phone, role: invite.role, expiresAt: invite.expiresAt })
    .from(invite)
    .where(and(inArray(invite.orgId, ids), isNull(invite.redeemedAt), isNull(invite.revokedAt)))
    .orderBy(asc(invite.name));
  return [
    ...members.map((row): PersonRow => ({ kind: "member", id: row.id, userId: row.userId, orgId: row.orgId, orgName: nameOf.get(row.orgId) ?? "", name: row.name, jobTitle: row.jobTitle, email: row.email, phone: row.phone, role: row.role, state: row.status })),
    ...invites.map((row): PersonRow => ({ kind: "invite", id: row.id, userId: null, orgId: row.orgId, orgName: nameOf.get(row.orgId) ?? "", name: row.name, jobTitle: row.jobTitle, email: row.email, phone: row.phone, role: row.role, state: row.expiresAt > now ? "invited" : "invite-expired" })),
  ];
}

export interface ActivityRow {
  readonly id: string;
  readonly at: Date;
  readonly action: string;
  /** The admin who did it; null when the account has no membership row. */
  readonly by: string | null;
}

/** The recorded changes to a record: audit rows whose subject is one of the ids or carries the reference, newest first. Run inside a Fynix read. */
export async function readActivity(tx: ScopedTransaction, subjectIds: readonly string[], ref: string, limit = 50): Promise<readonly ActivityRow[]> {
  const rows = await tx
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, by: member.displayName })
    .from(auditLog)
    .leftJoin(member, eq(member.userId, auditLog.actorUserId))
    .where(or(eq(auditLog.subjectRef, ref), subjectIds.length === 0 ? undefined : inArray(auditLog.subjectId, [...subjectIds])))
    .orderBy(desc(auditLog.at))
    .limit(limit);
  return rows;
}
