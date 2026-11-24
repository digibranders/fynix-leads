import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { databaseRefusal } from "@/server/domain/db-refusal";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { fynixRead, fynixSelfWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createSupplierPartnerAgencySchema, ownProfileSchema, uuidSchema, type OwnProfileInput } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotMember } from "@/server/domain/snapshots";

/** A person on a Team page. Fynix reads people through `readPeople`; this is what a client, coordinator or partner agency may read of its own side. */
export interface TeamRow {
  readonly kind: "member" | "invite";
  /** The member id for a person, the invite id for an invite. */
  readonly id: string;
  /** The partner agency's id for a coordinator reading a partner agency's person; null for the caller's own organisation. */
  readonly orgId: string | null;
  readonly orgName: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly role: "member" | "manager";
  readonly state: "active" | "suspended" | "invited" | "invite-expired";
  readonly meetingEmails: boolean;
}

type TeamDatabaseRow = {
  kind: "member" | "invite";
  id: string;
  org_id: string | null;
  org_name: string;
  name: string;
  job_title: string | null;
  email: string;
  phone: string | null;
  role: "member" | "manager";
  status: "active" | "suspended" | "invited";
  meeting_emails: boolean;
  expires_at: Date | string | null;
};

/** The state shown for a row: a lapsed invite says so. */
export function teamState(status: TeamDatabaseRow["status"], expiresAt: Date | null, now: Date): TeamRow["state"] {
  if (status !== "invited") return status;
  return expiresAt !== null && expiresAt > now ? "invited" : "invite-expired";
}

/**
 * The people of the caller's side (migration 0062, `app_my_team`): a client its own, a coordinator its own and its partner agencies', a partner agency its own.
 * Open invites are listed to managers only. Own organisation first, then partner agencies by name; people by name, open invites last.
 */
export async function listMyTeam(db: Database, deps: Pick<DomainDeps, "now">, actor: Pick<TenantActor, "userId" | "orgId">): Promise<readonly TeamRow[]> {
  const rows = await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => (await tx.execute<TeamDatabaseRow>(sql`select * from public.app_my_team()`)).rows);
  const now = deps.now();
  return rows
    .map((row): TeamRow => ({
      kind: row.kind,
      id: row.id,
      orgId: row.org_id,
      orgName: row.org_name,
      name: row.name,
      jobTitle: row.job_title,
      email: row.email,
      phone: row.phone,
      role: row.role,
      state: teamState(row.status, row.expires_at === null ? null : new Date(row.expires_at), now),
      meetingEmails: row.meeting_emails,
    }))
    .sort((a, b) => Number(b.orgId === null) - Number(a.orgId === null) || a.orgName.localeCompare(b.orgName) || Number(a.kind === "invite") - Number(b.kind === "invite") || a.name.localeCompare(b.name));
}

/**
 * A client manager switches the meeting emails of a person in their own client on or off. The database repeats the rule (migration 0062): only an
 * active manager, only the rows of their own organisation, only that column. A person of another organisation is `not-found`, whatever the id.
 */
export async function setMemberMeetingEmails(db: Database, actor: TenantActor, memberId: string, enabled: boolean): Promise<void> {
  const id = parseInput(uuidSchema, memberId);
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a client manager switches meeting emails.");
  if (actor.role !== "manager") throw new DomainError("not-authorised", "Only a manager can change who gets meeting emails.");
  await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const updated = await tx.update(member).set({ meetingEmails: enabled }).where(eq(member.id, id)).returning({ id: member.id });
    if (updated.length === 0) throw new DomainError("not-found", "There is no such member.");
  });
}

const PARTNER_REFUSALS: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>(["not-authorised", "organisation-archived", "duplicate-name"]);

export interface AddedPartnerAgency {
  readonly id: string;
  readonly publicRef: string;
}

/**
 * A coordinator's manager adds a partner agency under their own coordinator. `db` is the `leads_agency` pool. The whole rule lives in the database function
 * `app_add_partner_agency` (migration 0062): an active manager of an active agency with no parent, and no partner of that name already (any case).
 * A partner agency's manager, a member, a client and another coordinator are all refused with `not-authorised`; nobody can name a different parent.
 * No audit row: the audit log is for Fynix writes (the new agency shows in Fynix's lists like any other).
 */
export async function addPartnerAgencyAsCoordinator(deps: Pick<DomainDeps, "randomBytes">, db: Database, actor: TenantActor, input: unknown): Promise<AddedPartnerAgency> {
  const parsed = parseInput(createSupplierPartnerAgencySchema, input);
  if (actor.orgKind !== "agency" || actor.role !== "manager") throw new DomainError("not-authorised", "Only a coordinator manager can add a partner agency.");
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) =>
      insertWithPublicRef(tx, { prefix: "ORG", constraint: "organisation_public_ref_unique", randomBytes: deps.randomBytes }, async (attempt, ref) => {
        const result = await attempt.execute<{ org_id: string; org_ref: string }>(sql`select org_id, org_ref from public.app_add_partner_agency(${parsed.name}, ${ref})`);
        const row = result.rows[0];
        if (row === undefined) throw new Error("The partner agency function returned no row");
        return { id: row.org_id, publicRef: row.org_ref };
      }),
    );
  } catch (error) {
    const refusal = databaseRefusal(error, PARTNER_REFUSALS, "The agency was refused.");
    if (refusal !== null) throw refusal;
    throw error;
  }
}

const OWN_REFUSALS: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>(["not-authorised"]);

function ownDetailsCall(tx: ScopedTransaction, parsed: OwnProfileInput): Promise<unknown> {
  return tx.execute(sql`select public.app_update_own_details(${parsed.displayName}, ${parsed.jobTitle}, ${parsed.phone})`);
}

/**
 * Changes the signed-in client or agency person's own name, job title and phone (a blank phone clears it). `db` is the caller's own role pool. The database
 * finds the row by the account in the scope, never by an id, and only an active member's (migration 0062). No audit row: the audit log is for Fynix writes.
 */
export async function updateOwnProfile(db: Database, actor: Pick<TenantActor, "userId" | "orgId">, input: unknown): Promise<void> {
  const parsed = parseInput(ownProfileSchema, input);
  try {
    await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => ownDetailsCall(tx, parsed));
  } catch (error) {
    const refusal = databaseRefusal(error, OWN_REFUSALS, "Your details could not be changed.");
    if (refusal !== null) throw refusal;
    throw error;
  }
}

/** The same for a Fynix person, admin or staff. Fynix changes are audited, so this one writes an audit row beside the change (`member.update_details`). */
export async function updateOwnFynixProfile(db: Database, actor: FynixActor, input: unknown): Promise<void> {
  const parsed = parseInput(ownProfileSchema, input);
  try {
    await fynixSelfWrite(db, actor, async ({ tx, actorMemberId, audit }) => {
      await ownDetailsCall(tx, parsed);
      const [after] = await tx
        .select({ id: member.id, orgId: member.orgId, role: member.role, displayName: member.displayName, jobTitle: member.jobTitle, phone: member.phone, status: member.status })
        .from(member)
        .where(eq(member.id, actorMemberId))
        .limit(1);
      if (after === undefined) throw new DomainError("not-authorised", "Your details could not be changed.");
      await audit({ action: "member.update_details", subject: { table: "member", id: after.id }, before: null, after: snapshotMember(after) });
    });
  } catch (error) {
    const refusal = databaseRefusal(error, OWN_REFUSALS, "Your details could not be changed.");
    if (refusal !== null) throw refusal;
    throw error;
  }
}

export interface OwnProfile {
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
}

const ownColumns = { displayName: member.displayName, jobTitle: member.jobTitle, phone: member.phone };

/** The signed-in client or agency person's own member row, for the profile page. */
export async function readOwnProfile(db: Database, actor: Pick<TenantActor, "userId" | "orgId">): Promise<OwnProfile> {
  const [row] = await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) =>
    tx.select(ownColumns).from(member).where(and(eq(member.userId, actor.userId), eq(member.status, "active"))).limit(1),
  );
  if (row === undefined) throw new DomainError("not-found", "There is no such member.");
  return row;
}

/** The signed-in Fynix person's own member row. */
export async function readOwnFynixProfile(db: Database, actor: FynixActor): Promise<OwnProfile> {
  const [row] = await fynixRead(db, actor, (tx) => tx.select(ownColumns).from(member).where(and(eq(member.userId, actor.userId), eq(member.status, "active"))).limit(1));
  if (row === undefined) throw new DomainError("not-found", "There is no such member.");
  return row;
}
