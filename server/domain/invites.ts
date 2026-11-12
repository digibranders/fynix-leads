import { and, eq, isNull } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { inviteLookupChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { inviteExpiry, inviteState } from "@/lib/domain/invite-state";
import { formatEmailDate } from "@/lib/email/templates";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { invite, organisation, user } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { requireFreeAlias } from "@/server/domain/aliases";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor, type FynixWrite } from "@/server/domain/fynix-write";
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
  if (org.kind === "fynix") throw new DomainError("invalid-input", "Nobody is invited into the Fynix organisation.");
  if (org.status !== "active") throw new DomainError("organisation-archived", "The organisation is archived.");
  if (org.kind === "agency" && parsed.alias === undefined) throw new DomainError("invalid-input", "alias is required for an agency invite");
  if (org.kind === "client" && parsed.alias !== undefined) throw new DomainError("invalid-input", "alias is not allowed for a client invite");

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

  if (parsed.alias !== undefined) {
    // After the old invite is revoked: re-inviting the same person with the same alias is not a clash with themselves.
    await requireFreeAlias(tx, parsed.alias);
  }

  const { token, tokenHash } = generateInviteToken(deps.randomBytes);
  const expiresAt = inviteExpiry(now);
  const [created] = await tx
    .insert(invite)
    .values({ orgId: org.id, orgKind: org.kind, email, name: parsed.name, role: parsed.role, alias: parsed.alias ?? null, tokenHash, expiresAt, createdBy: actor.userId })
    .returning({ id: invite.id });
  if (created === undefined) throw new Error("The invite insert returned no row");

  const link = new URL(ACCEPT_INVITE_PATH, deps.origin);
  link.searchParams.set("token", token);
  await enqueueEmail(tx, { to: email, content: { template: "invite", params: { name: parsed.name, organisationName: org.name, expiresOn: formatEmailDate(expiresAt) } }, link: link.toString(), inviteId: created.id });
  await audit({
    action: "invite.issue",
    subject: { table: "invite", id: created.id },
    before: null,
    after: snapshotInvite({ orgId: org.id, email, name: parsed.name, role: parsed.role, alias: parsed.alias ?? null, expiresAt }),
  });
  return { inviteId: created.id, expiresAt };
}

/**
 * Issues an invite: a 32 byte token, its SHA-256 stored, a link in the outbox, valid for seven days. Any live invite for
 * the same address is revoked first, in the same transaction. Refused when the address already has an account, when the
 * organisation is archived or is Fynix, when an agency invite has no alias or a client invite has one, when the alias is
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
    return issueWithin(write, actor, deps, { organisationId: old.orgId, email: old.email, name: old.name, role: old.role, ...(old.alias === null ? {} : { alias: old.alias }) });
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
    return { status: "pending", name: row.name, email: row.email, party: row.orgKind, expiresAt: row.expiresAt, terms: await readCurrentTerms(tx, row.orgKind) } as const;
  });
}
