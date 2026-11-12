import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/** What the check needs to know about the session it is asked about. */
export interface SecondFactorSubject {
  readonly kind: OrganisationKind;
  readonly userId: string;
  readonly sessionId: string;
}

export type SecondFactorCheck = (subject: SecondFactorSubject) => Promise<boolean>;

/**
 * EXTENSION POINT FOR GATE G1 (master plan, sections 1 and 7: decision D3). Phase 1 signs the Fynix admin in with a
 * password only, so this accepts every session. Before any real client or agency data is entered, G1 replaces it with a
 * check that the Fynix user's session completed an authenticator-app code or a passkey step (Better Auth's two-factor
 * plugin), and may add the same for other kinds. `resolveSessionContext` already calls it for every session and treats
 * `false` as "not signed in", so nothing else changes when G1 lands. Nothing here implements a second factor.
 */
export const secondFactorSatisfied: SecondFactorCheck = async () => true;
