import type { ScopedTransaction } from "@/server/db/scope";
import { auditLog } from "@/server/db/schema";

/**
 * Every action a Fynix admin can take, as `<table>.<verb>`. The database checks the shape (`audit_log_action_format`);
 * this list is what the services may write.
 */
export const AUDIT_ACTIONS = [
  "organisation.create",
  "organisation.update",
  "organisation.archive",
  "organisation.restore",
  "client_profile.update",
  "client_collateral.add",
  "client_collateral.remove",
  "campaign.create",
  "campaign.update",
  "campaign.archive",
  "campaign.restore",
  "invite.issue",
  "invite.revoke",
  "member.suspend",
  "member.reactivate",
  "member.rename",
  "member.update_details",
  "agency_alias.set",
  "terms.publish",
  "agreement.publish",
  "agreement.accept",
  "campaign_share.set",
  "campaign_share.remove",
  "campaign_host.add",
  "campaign_host.deactivate",
  "host_hours.set",
  "host_block.add",
  "host_block.remove",
  "lead.resolve_dispute",
  "conversation.create",
  "conversation.open_direct",
  "conversation.message",
  "chat_group.update",
  "chat_group.delete",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditSubjectTable =
  | "organisation"
  | "client_profile"
  | "client_collateral"
  | "campaign"
  | "invite"
  | "member"
  | "agency_alias"
  | "terms_document"
  | "agreement"
  | "agreement_acceptance"
  | "campaign_share"
  | "campaign_host"
  | "host_hours"
  | "host_block"
  | "lead"
  | "conversation"
  | "conversation_message"
  | "chat_group";

export type Json = string | number | boolean | null | readonly Json[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: Json;
}

export interface AuditEntry {
  readonly action: AuditAction;
  readonly subject: { readonly table: AuditSubjectTable; readonly id: string; readonly ref?: string | null };
  /** The public-safe state before the change: a snapshot from server/domain/snapshots.ts, never a raw row. */
  readonly before?: Json | null;
  readonly after?: Json | null;
}

/**
 * Appends one row to the audit log inside the caller's transaction. The actor, the role and the time come from the request
 * scope and the connection (column defaults), not from the caller, and the policy refuses any other value.
 */
export async function appendAudit(tx: ScopedTransaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    action: entry.action,
    subjectTable: entry.subject.table,
    subjectId: entry.subject.id,
    subjectRef: entry.subject.ref ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
