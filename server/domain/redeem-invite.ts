import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { inviteRedeemChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { inviteState, type InviteState } from "@/lib/domain/invite-state";
import { AccountAlreadyExistsError, createAccountWithGrant } from "@/server/auth/create-account";
import { authErrorCode, authErrorMessage, PASSWORD_CHECK_UNAVAILABLE_CODE, PASSWORD_PROBLEM_CODES } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { agencyAlias, invite, member } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { hashInviteToken, isWellFormedInviteToken } from "@/server/domain/invite-token";
import { readCurrentTerms, recordAcceptance } from "@/server/domain/terms";

export interface RedeemInput {
  /** The token from the link. */
  readonly token: string;
  /** The password the person chose. Checked by the same policy as every password (length, breached passwords). */
  readonly password: string;
  /** The id of the terms document the person was shown and ticked. Empty or missing when the box was not ticked. */
  readonly acceptedTermsId: string | null;
  /** The network address of the request (`clientAddressFrom`), for the rate limit and the acceptance record. */
  readonly address: string;
}

export type RedeemResult =
  | { readonly status: "redeemed"; readonly userId: string; readonly email: string; readonly party: OrganisationKind }
  /** The link cannot be used: never issued, or `expired`, `revoked` or `redeemed` already. Nothing was created. */
  | { readonly status: "invite-unavailable"; readonly reason: "invalid" | Exclude<InviteState, "pending"> }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number }
  /** `message` is worded for the person: too short, too long, or found in a breach. The invite is still usable. */
  | { readonly status: "weak-password"; readonly message: string }
  /** The breached-password service could not be reached. Nothing was created and the invite is still usable. */
  | { readonly status: "check-unavailable" }
  /** The box was not ticked. */
  | { readonly status: "terms-not-accepted" }
  /** The terms the person ticked are not the current ones (a new version was published, or none is). The page shows the current text again. */
  | { readonly status: "terms-changed" }
  /** The address already has an account, so the invite cannot create one. Fynix has to look at it. */
  | { readonly status: "account-exists" };

/** Thrown inside the transaction to roll everything back and carry the result out. */
class Rollback extends Error {
  constructor(readonly result: RedeemResult) {
    super("redeem rolled back");
  }
}

/**
 * Redeems an invite: one database transaction as `leads_auth`, so the account, the membership, the alias, the acceptance of
 * the terms and the invite's `redeemed_at` all commit together or not at all (decision C1). A weak password, a breached one,
 * a service outage or a clash found half way leaves nothing behind and the invite usable.
 *
 * Order: the network's and the invite's redeem limits are consumed first, outside any transaction and before any lookup;
 * then, in the transaction, the invite is read and checked, the current terms are compared with the ones ticked, the invite is
 * claimed (the database refuses an invite that is used, revoked or expired, so two redemptions at once cannot both win),
 * the account is created inside the account creation grant with Better Auth running on the same transaction, and the
 * membership, the alias and the acceptance are written. The email and the name are the invite's, not the form's.
 *
 * It does not sign anyone in: the caller does, with the same password, through the normal sign-in.
 */
export async function redeemInvite(deps: DomainDeps, input: RedeemInput): Promise<RedeemResult> {
  const tokenHash = hashInviteToken(input.token);
  const blocked = await firstBlockedLimit(deps.publicDb, inviteRedeemChecks(tokenHash, input.address), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (!isWellFormedInviteToken(input.token)) return { status: "invite-unavailable", reason: "invalid" };
  if (input.acceptedTermsId === null || input.acceptedTermsId === "") return { status: "terms-not-accepted" };
  const acceptedTermsId = input.acceptedTermsId;

  try {
    return await withInviteHash(deps.authDb, tokenHash, async (tx) => {
      const [row] = await tx
        .select({ id: invite.id, orgId: invite.orgId, orgKind: invite.orgKind, email: invite.email, name: invite.name, role: invite.role, alias: invite.alias, expiresAt: invite.expiresAt, redeemedAt: invite.redeemedAt, revokedAt: invite.revokedAt })
        .from(invite)
        .limit(1);
      if (row === undefined) return { status: "invite-unavailable", reason: "invalid" } as const;
      const state = inviteState(row, deps.now());
      if (state !== "pending") return { status: "invite-unavailable", reason: state } as const;

      const terms = await readCurrentTerms(tx, row.orgKind);
      if (terms === null || terms.id !== acceptedTermsId) return { status: "terms-changed" } as const;

      // The claim. The update policy lets the row through only while it is unused, unrevoked and unexpired, so of two
      // redemptions at once the second finds no row (it waits for the first to commit, then re-checks).
      const claimed = await tx.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, row.id)).returning({ id: invite.id });
      if (claimed.length === 0) return { status: "invite-unavailable", reason: "redeemed" } as const;

      let userId: string;
      try {
        ({ userId } = await createAccountWithGrant(deps.authFactory(tx), tx, { email: row.email, name: row.name, password: input.password }));
      } catch (error) {
        if (error instanceof AccountAlreadyExistsError) throw new Rollback({ status: "account-exists" });
        const code = authErrorCode(error);
        if (code === PASSWORD_CHECK_UNAVAILABLE_CODE) throw new Rollback({ status: "check-unavailable" });
        if (code !== undefined && PASSWORD_PROBLEM_CODES.has(code)) throw new Rollback({ status: "weak-password", message: authErrorMessage(error) ?? "Choose a different password." });
        throw error;
      }

      const memberId = randomUUID();
      await tx.insert(member).values({ id: memberId, userId, orgId: row.orgId, orgKind: row.orgKind, role: row.role, displayName: row.name });
      if (row.alias !== null) {
        try {
          await tx.insert(agencyAlias).values({ memberId, alias: row.alias });
        } catch (error) {
          if (isUniqueViolation(error)) throw new DomainError("alias-taken", "Another person has taken this invite's alias since it was issued.");
          throw error;
        }
      }
      await recordAcceptance(tx, { userId, documentId: terms.id, party: row.orgKind, networkAddress: input.address });
      return { status: "redeemed", userId, email: row.email, party: row.orgKind } as const;
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}
