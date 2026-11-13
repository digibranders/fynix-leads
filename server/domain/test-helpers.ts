import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog, emailOutbox, member } from "@/server/db/schema";
import type { SeededCampaign, SeededOrganisation, SeededUser } from "@/server/db/testing/seed";
import type { AuditAction } from "@/server/domain/audit";
import { DomainError } from "@/server/domain/errors";
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

/** The error a call must be refused with. Fails the test when the call succeeds, and rethrows anything that is not a `DomainError`. */
export async function refusal(work: Promise<unknown>): Promise<DomainError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
}

/** The first seeded campaign: Kestrel (client) and Brightpath (supplier). */
export function firstCampaign(rig: DomainRig): SeededCampaign {
  const row = rig.world().campaigns[0];
  if (row === undefined) throw new Error("The seed world has no campaign");
  return row;
}

/** The one seeded user of a client or agency organisation. Not for Fynix, which has two (the admin and the staff member). */
export function userIn(rig: DomainRig, organisation: SeededOrganisation): SeededUser {
  const person = rig.world().users.find((candidate) => candidate.organisation.id === organisation.id);
  if (person === undefined) throw new Error(`The seed world has no user in ${organisation.publicRef}`);
  return person;
}

/** The `member.id` of a user, read as the owner. */
export async function memberIdFor(rig: DomainRig, userId: string): Promise<string> {
  const [row] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, userId)).limit(1);
  if (row === undefined) throw new Error(`No member row for user ${userId}`);
  return row.id;
}

/** Changes a member's role as the owner, which is how a test makes a client or supplier user a manager. */
export async function setMemberRole(rig: DomainRig, userId: string, role: "member" | "manager"): Promise<void> {
  await rig.dbs.owner.db.update(member).set({ role }).where(eq(member.userId, userId));
}
