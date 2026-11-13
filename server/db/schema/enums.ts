import { pgEnum } from "drizzle-orm/pg-core";

export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed", "archived"]);
export const memberRole = pgEnum("member_role", ["member", "manager"]);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
export const emailTemplate = pgEnum("email_template", ["password_reset", "invite"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed", "cancelled"]);
export const termsStatus = pgEnum("terms_status", ["current", "superseded"]);
/** Which side of a campaign an agreement is with: Fynix and the client, or Fynix and the supplier (spec 7.2). */
export const agreementParty = pgEnum("agreement_party", ["client", "supplier"]);
export const agreementStatus = pgEnum("agreement_status", ["current", "superseded"]);

