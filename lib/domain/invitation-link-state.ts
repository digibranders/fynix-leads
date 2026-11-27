/** What the reply form of an invitation email shows after an answer. Plain data only, so a client form can import it. */
export type InvitationLinkState =
  | { readonly status: "idle" }
  | { readonly status: "answered"; readonly reply: "accepted" | "declined"; readonly confirmed: boolean; readonly needsNewTime: boolean }
  | { readonly status: "refused"; readonly message: string };

export const INVITATION_LINK_IDLE: InvitationLinkState = { status: "idle" };
