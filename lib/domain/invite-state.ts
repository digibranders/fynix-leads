/** An invite lasts seven days from the moment it is issued (spec section 12). */
export const INVITE_LIFETIME_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function inviteExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + INVITE_LIFETIME_DAYS * DAY_MS);
}

/** The columns of an invite that decide whether it can still be used. */
export interface InviteTimes {
  readonly expiresAt: Date;
  readonly redeemedAt: Date | null;
  readonly revokedAt: Date | null;
}

/**
 * What a person holding the link is told. Checked in this order, so an invite that was used and later revoked reads as
 * used, and one that was revoked and has also run out reads as revoked.
 */
export type InviteState = "redeemed" | "revoked" | "expired" | "pending";

export function inviteState(invite: InviteTimes, now: Date): InviteState {
  if (invite.redeemedAt !== null) return "redeemed";
  if (invite.revokedAt !== null) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}
