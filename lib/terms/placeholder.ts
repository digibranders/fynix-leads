import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/**
 * PLACEHOLDER terms of use, one per party (decision D2). They exist so the invite and sign-in flow can be built and
 * tested end to end. They are not legal text and nobody has agreed to anything by reading them. Gate G2: lawyer-approved
 * text replaces these, through the terms screen, before any real user is invited. The database marks each row
 * `placeholder = true`, the invite service refuses to invite anyone on an https deployment while a party's current terms
 * are still marked, and the screens show PLACEHOLDER_NOTICE above the text.
 */
export const PLACEHOLDER_NOTICE = "Placeholder text. These terms are a stand-in and are replaced with lawyer-approved terms before real users are invited.";

export interface TermsText {
  readonly title: string;
  readonly body: string;
}

const COMMON = [
  "PLACEHOLDER. This is not the agreed contract.",
  "",
  "1. You use Fynix Leads only for the work Fynix has asked you to do on it.",
  "2. You keep your sign-in private and tell Fynix at once if you think someone else has used it.",
  "3. Fynix records that you accepted these terms, the version, the time and the network address you accepted from.",
];

export const PLACEHOLDER_TERMS: Readonly<Record<OrganisationKind, TermsText>> = {
  client: {
    title: "Terms of use for clients (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. Non-circumvention: you do not contact or work with the people who deliver your leads outside Fynix.",
      "5. Non-solicitation: you do not hire the people who deliver your leads while this agreement lasts and for a period set in the agreed text.",
      "6. Decisions you record on a lead are final unless Fynix corrects them with a note.",
    ].join("\n"),
  },
  agency: {
    title: "Terms of use for agencies (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. Non-circumvention: you do not contact or work with the client outside Fynix.",
      "5. Non-solicitation: you do not hire the client's people while this agreement lasts and for a period set in the agreed text.",
      "6. You join meetings as a guest under your Fynix alias and you do not sign in to a personal Google account to do so.",
    ].join("\n"),
  },
  fynix: {
    title: "Terms of use for Fynix staff (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. You see both parties' identities. You do not share one party's identity with the other.",
      "5. Every change you make is recorded in the audit log under your name.",
    ].join("\n"),
  },
};
