import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { inviteLookupChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { inviteExpiry, inviteState } from "@/lib/domain/invite-state";
import { formatEmailDate, renderEmail } from "@/lib/email/templates";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { Database } from "@/server/db/pool";
import { invite, member, organisation, user } from "@/server/db/schema";
import { withInviteHash, withTenantScope } from "@/server/db/scope";
import { requireFreeAlias } from "@/server/domain/aliases";
import type { DomainDeps } from "@/server/domain/deps";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError, isUniqueViolation, type DomainErrorCode } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor, type FynixWrite } from "@/server/domain/fynix-write";
import { issueInviteSchema, uuidSchema, type IssueInviteInput } from "@/server/domain/inputs";
import { generateInviteToken, hashInviteToken, isWellFormedInviteToken } from "@/server/domain/invite-token";
import { parseInput } from "@/server/domain/parse";
import { snapshotInvite } from "@/server/domain/snapshots";
import { readCurrentTerms, type TermsRecord } from "@/server/domain/terms";
import { cancelInviteMail, enqueueEmail } from "@/server/mail/outbox";

/** The path of the accept-invite page. The reset link is `/reset-password`, in the same place. */
export const ACCEPT_INVITE_PATH = "/accept-invite";

export interface IssuedInvite {
  readonly inviteId: string;
  readonly expiresAt: Date;
}

const inviteColumns = {
  id: invite.id,
  orgId: invite.orgId,
  email: invite.email,
  name: invite.name,
  role: invite.role,
  jobTitle: invite.jobTitle,
  phone: invite.phone,
  alias: invite.alias,
  expiresAt: invite.expiresAt,
  redeemedAt: invite.redeemedAt,
  revokedAt: invite.revokedAt,
};

/**
 * The whole of issuing, inside the caller's Fynix transaction: checks, revoking any live invite for the address, the new
 * invite, its email in the outbox and the audit rows. Because it is one transaction, "issue a new invite revokes the old
 * one" cannot be half done, and an invite never exists without its email being queued.
 */
async function issueWithin({ tx, audit }: FynixWrite, actor: FynixActor, deps: DomainDeps, input: IssueInviteInput): Promise<IssuedInvite> {
  const parsed = parseInput(issueInviteSchema, input);
  const email = normaliseEmail(parsed.email);

  const [org] = await tx.select({ id: organisation.id, kind: organisation.kind, name: organisation.name, status: organisation.status }).from(organisation).where(eq(organisation.id, parsed.organisationId)).limit(1);
  if (org === undefined) throw new DomainError("not-found", "There is no such organisation.");
  if (org.status !== "active") throw new DomainError("organisation-archived", "The organisation is archived.");
  if (org.kind !== "agency" && parsed.alias !== undefined) throw new DomainError("invalid-input", "alias is for an agency invite only");
  // The person's own name is the alias unless Fynix chose another (it is never asked for any more).
  const alias = org.kind === "agency" ? (parsed.alias ?? parsed.name) : null;

  const existing = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) throw new DomainError("email-in-use", "That address already has an account.");

  const terms = await readCurrentTerms(tx, org.kind);
  if (terms === null) throw new DomainError("no-current-terms", `There are no current terms for ${org.kind} users to accept.`);
  if (terms.placeholder && !deps.allowPlaceholderTerms) throw new DomainError("placeholder-terms", "The current terms are still placeholder text. Publish approved terms first.");

  // The previous live invite for this address goes first (the unique index allows one). Its unsent email is cancelled so
  // the person is not sent a link that is already dead.
  const now = deps.now();
  const replaced = await tx.update(invite).set({ revokedAt: now }).where(and(eq(invite.email, email), isNull(invite.redeemedAt), isNull(invite.revokedAt))).returning(inviteColumns);
  for (const old of replaced) {
    await cancelInviteMail(tx, old.id);
    await audit({ action: "invite.revoke", subject: { table: "invite", id: old.id }, before: snapshotInvite(old), after: { ...snapshotInvite(old), revokedAt: now.toISOString(), reason: "replaced by a new invite" } });
  }

  if (alias !== null) {
    // After the old invite is revoked: re-inviting the same person with the same alias is not a clash with themselves.
    await requireFreeAlias(tx, alias);
  }

  const { token, tokenHash } = generateInviteToken(deps.randomBytes);
  const expiresAt = inviteExpiry(now);
  const [created] = await tx
    .insert(invite)
    .values({ orgId: org.id, orgKind: org.kind, email, name: parsed.name, jobTitle: parsed.jobTitle, phone: parsed.phone ?? null, role: parsed.role, alias, tokenHash, expiresAt, createdBy: actor.userId })
    .returning({ id: invite.id })
    // A second issue for the same address that committed after our revoke step. The driver error carries the row's email, name and token hash, so it is replaced, not wrapped.
    .catch((error: unknown) => {
      if (isUniqueViolation(error, "invite_one_live")) throw new DomainError("invite-conflict", "Another invite for that address was issued at the same time.");
      throw error;
    });
  if (created === undefined) throw new Error("The invite insert returned no row");

  const link = new URL(ACCEPT_INVITE_PATH, deps.origin);
  link.searchParams.set("token", token);
  await enqueueEmail(tx, { to: email, content: { template: "invite", params: { name: parsed.name, organisationName: org.name, expiresOn: formatEmailDate(expiresAt) } }, link: link.toString(), inviteId: created.id });
  await audit({
    action: "invite.issue",
    subject: { table: "invite", id: created.id },
    before: null,
    after: snapshotInvite({ orgId: org.id, email, name: parsed.name, role: parsed.role, jobTitle: parsed.jobTitle, phone: parsed.phone ?? null, alias, expiresAt }),
  });
  return { inviteId: created.id, expiresAt };
}

/**
 * Issues an invite: a 32 byte token, its SHA-256 stored, a link in the outbox, valid for seven days. Any live invite for
 * the same address is revoked first, in the same transaction. Refused when the address already has an account, when the
 * organisation is archived, when a client or Fynix invite has an alias, when the alias (an agency person's own name by default) is
 * taken, and when the party has no current terms (or only placeholder terms on an https deployment, gate G2). The token
 * is returned to nobody: it exists in the email link only.
 */
export async function issueInvite(deps: DomainDeps, actor: FynixActor, input: IssueInviteInput): Promise<IssuedInvite> {
  return fynixWrite(deps.fynixDb, actor, (write) => issueWithin(write, actor, deps, input));
}

/**
 * Sends an invite again: the old link cannot be recovered (only its hash is stored), so this revokes it and issues a new
 * one with the same person, organisation, role and alias. The old invite must not be redeemed.
 */
export async function resendInvite(deps: DomainDeps, actor: FynixActor, inviteId: string): Promise<IssuedInvite> {
  const id = parseInput(uuidSchema, inviteId);
  return fynixWrite(deps.fynixDb, actor, async (write) => {
    const [old] = await write.tx.select({ ...inviteColumns, orgKind: invite.orgKind }).from(invite).where(eq(invite.id, id)).limit(1);
    if (old === undefined) throw new DomainError("not-found", "There is no such invite.");
    if (old.redeemedAt !== null) throw new DomainError("invite-not-live", "That invite has been used already.");
    if (old.jobTitle === null) throw new DomainError("invalid-input", "That invite has no job title. Revoke it and invite the person again.");
    return issueWithin(write, actor, deps, {
      organisationId: old.orgId,
      email: old.email,
      name: old.name,
      jobTitle: old.jobTitle,
      role: old.role,
      ...(old.phone === null ? {} : { phone: old.phone }),
      ...(old.alias === null ? {} : { alias: old.alias }),
    });
  });
}

/** Revokes a live invite and cancels its unsent email. A used or already revoked invite cannot be revoked. */
export async function revokeInvite(deps: DomainDeps, actor: FynixActor, inviteId: string): Promise<void> {
  const id = parseInput(uuidSchema, inviteId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx.select(inviteColumns).from(invite).where(eq(invite.id, id)).limit(1).for("update");
    if (row === undefined) throw new DomainError("not-found", "There is no such invite.");
    if (row.redeemedAt !== null || row.revokedAt !== null) throw new DomainError("invite-not-live", "That invite is not live.");
    const now = deps.now();
    await tx.update(invite).set({ revokedAt: now }).where(eq(invite.id, id));
    await cancelInviteMail(tx, id);
    await audit({ action: "invite.revoke", subject: { table: "invite", id }, before: snapshotInvite(row), after: { ...snapshotInvite(row), revokedAt: now.toISOString(), reason: "revoked by Fynix" } });
  });
}

/** What the accept-invite page needs to show for a link. Every state but `pending` carries no personal data. */
export type InvitePreview =
  | { readonly status: "invalid" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number }
  | { readonly status: "expired" | "revoked" | "redeemed" }
  | {
      readonly status: "pending";
      /** The name and address Fynix typed, shown so the person knows the link is theirs. */
      readonly name: string;
      readonly email: string;
      readonly party: OrganisationKind;
      /** An agency invite into a partner agency (it has a coordinator above it) rather than into a coordinator. Always false for a client or Fynix. */
      readonly partner: boolean;
      readonly expiresAt: Date;
      /** The current terms of the party. `null` only if Fynix unpublished them after inviting: the page then cannot be accepted. */
      readonly terms: TermsRecord | null;
    };

/**
 * Looks a link up for the accept-invite page. The network's lookup limit is consumed first, for any input, so guessing
 * costs requests; a value that is not shaped like a token never reaches the database. The read runs as `leads_auth` with
 * only the invite whose hash it names in view.
 */
export async function previewInvite(deps: DomainDeps, input: { readonly token: string; readonly address: string }): Promise<InvitePreview> {
  const blocked = await firstBlockedLimit(deps.publicDb, inviteLookupChecks(input.address), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (!isWellFormedInviteToken(input.token)) return { status: "invalid" };

  return withInviteHash(deps.authDb, hashInviteToken(input.token), async (tx) => {
    const [row] = await tx
      .select({ name: invite.name, email: invite.email, orgKind: invite.orgKind, expiresAt: invite.expiresAt, redeemedAt: invite.redeemedAt, revokedAt: invite.revokedAt })
      .from(invite)
      .limit(1);
    if (row === undefined) return { status: "invalid" } as const;
    const state = inviteState(row, deps.now());
    if (state !== "pending") return { status: state } as const;
    const partner = row.orgKind === "agency" && (await tx.execute<{ partner: boolean | null }>(sql`select public.app_invite_org_is_partner() as partner`)).rows[0]?.partner === true;
    return { status: "pending", name: row.name, email: row.email, party: row.orgKind, partner, expiresAt: row.expiresAt, terms: await readCurrentTerms(tx, row.orgKind) } as const;
  });
}

const TENANT_REFUSALS: ReadonlySet<string> = new Set<DomainErrorCode>(["not-authorised", "organisation-archived", "email-in-use", "no-current-terms", "placeholder-terms", "alias-taken", "invite-conflict"]);

/** The `domain:<code>` an invite function raised, anywhere in the error's cause chain, as the matching refusal. Anything else is rethrown. */
function tenantInviteRefusal(error: unknown): DomainError | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth += 1) {
    const match = /^domain:([a-z-]+)$/.exec(current.message);
    if (match?.[1] !== undefined && TENANT_REFUSALS.has(match[1])) return new DomainError(match[1] as DomainErrorCode, "The invite was refused.");
  }
  return null;
}

/**
 * Issues an invite from the tenant side: a client manager into their own client, a coordinator manager into their own coordinator or one
 * of its partner agencies, a partner agency manager into their own agency. `db` is the caller's own role pool (`leads_client` or `leads_agency`).
 * The tenant roles hold no grant on accounts, terms or the outbox, so the whole step runs in the database function `app_issue_tenant_invite`
 * (migration 0059), which checks that the caller is an active manager of the organisation (or its coordinator), then does what `issueInvite` does:
 * the same refusals, the old live invite revoked, the invite and its email written together. The inviter is recorded in `invite.created_by`.
 * No audit row: the audit log is for Fynix writes.
 */
export async function issueTenantInvite(deps: DomainDeps, db: Database, actor: TenantActor, input: IssueInviteInput): Promise<IssuedInvite> {
  const parsed = parseInput(issueInviteSchema, input);
  if (actor.role !== "manager") throw new DomainError("not-authorised", "Only a manager can invite people.");
  const email = normaliseEmail(parsed.email);
  const now = deps.now();
  const expiresAt = inviteExpiry(now);
  const { token, tokenHash } = generateInviteToken(deps.randomBytes);
  const link = new URL(ACCEPT_INVITE_PATH, deps.origin);
  link.searchParams.set("token", token);

  // Only a coordinator has people below it; anyone else may invite into their own organisation only.
  if (parsed.organisationId !== actor.orgId && actor.orgKind !== "agency") throw new DomainError("not-authorised", "The invite was refused.");
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      // The name for the email: the caller's own organisation, or one of its partner agencies (a supplier holds no grant on organisation).
      const named =
        parsed.organisationId === actor.orgId
          ? await tx.select({ name: organisation.name }).from(organisation).limit(1)
          : (await tx.execute<{ name: string }>(sql`select name from public.app_my_partner_agencies() where id = ${parsed.organisationId}::uuid`)).rows;
      const organisationName = named[0]?.name;
      if (organisationName === undefined) throw new DomainError("not-authorised", "The invite was refused.");
      const stored = renderEmail({ template: "invite", params: { name: parsed.name, organisationName, expiresOn: formatEmailDate(expiresAt) } }, null);
      const params = JSON.stringify({ name: parsed.name, organisationName, expiresOn: formatEmailDate(expiresAt) });
      const result = await tx.execute<{ id: string }>(sql`
        select public.app_issue_tenant_invite(
          ${parsed.organisationId}::uuid, ${email}, ${parsed.name}, ${parsed.jobTitle}, ${parsed.phone ?? null}, ${parsed.role}::public.member_role, ${parsed.alias ?? null},
          ${tokenHash}, ${expiresAt.toISOString()}::timestamptz, ${deps.allowPlaceholderTerms}, ${link.toString()}, ${stored.subject}, ${stored.text}, ${params}::jsonb
        ) as id`);
      const id = result.rows[0]?.id;
      if (id === undefined) throw new Error("The invite function returned no row");
      return { inviteId: id, expiresAt };
    });
  } catch (error) {
    // The driver error carries the statement and its parameters (the address and the live link), so a refusal replaces it and nothing else is wrapped.
    const refusal = tenantInviteRefusal(error);
    if (refusal !== null) throw refusal;
    throw error;
  }
}

export interface InviteListRow {
  readonly id: string;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly email: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly role: "member" | "manager";
  readonly state: "pending" | "redeemed" | "revoked" | "expired";
  readonly expiresAt: Date;
  readonly createdAt: Date;
  /** The name of the person who invited them, or null when that person has no membership row (the first admin made by script). */
  readonly invitedBy: string | null;
}

/** Every invite, newest first, whoever issued it: Fynix, a client manager or a coordinator manager. Open to Fynix staff. Never carries a token or hash. */
export async function listInvites(deps: DomainDeps, actor: FynixActor): Promise<readonly InviteListRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const rows = await tx
      .select({
        id: invite.id,
        organisationId: invite.orgId,
        organisationName: organisation.name,
        email: invite.email,
        name: invite.name,
        jobTitle: invite.jobTitle,
        phone: invite.phone,
        role: invite.role,
        expiresAt: invite.expiresAt,
        redeemedAt: invite.redeemedAt,
        revokedAt: invite.revokedAt,
        createdAt: invite.createdAt,
        invitedBy: member.displayName,
      })
      .from(invite)
      .innerJoin(organisation, eq(organisation.id, invite.orgId))
      .leftJoin(member, eq(member.userId, invite.createdBy))
      .orderBy(desc(invite.createdAt));
    const now = deps.now();
    return rows.map(({ redeemedAt, revokedAt, ...row }) => ({ ...row, state: inviteState({ expiresAt: row.expiresAt, redeemedAt, revokedAt }, now) }));
  });
}
