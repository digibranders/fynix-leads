/** The three kinds of organisation, and so of user. server/auth/session-lifetime.test.ts checks this matches the database enum. */
export type OrganisationKind = "fynix" | "client" | "agency";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * How long a session lasts from the moment of sign-in, by the kind of the user's organisation (spec section 12 and the
 * master plan, section 3). Fixed, not sliding: a session is never extended while in use, so a Fynix session is over 12
 * hours after sign-in whatever the user does. The Fynix admin sees both parties' identities, so it gets the short one.
 */
export const SESSION_LIFETIME_SECONDS = {
  fynix: 12 * HOUR,
  client: 14 * DAY,
  agency: 14 * DAY,
} as const satisfies Record<OrganisationKind, number>;

/** How long a password reset link works. Short: until it is used it is as good as the password. */
export const PASSWORD_RESET_LIFETIME_SECONDS = HOUR;

/** The lifetime for a kind, in seconds. */
export function sessionLifetimeSeconds(kind: OrganisationKind): number {
  return SESSION_LIFETIME_SECONDS[kind];
}

/** True when a session that started at `createdAt` is older than the kind allows at `now`. */
export function sessionTooOld(kind: OrganisationKind, createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= SESSION_LIFETIME_SECONDS[kind] * 1000;
}
