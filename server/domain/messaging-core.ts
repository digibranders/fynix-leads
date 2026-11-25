import {
  agencyConversationColumns,
  agencyConversationMessageColumns,
  agencyNotificationColumns,
  clientConversationColumns,
  clientConversationMessageColumns,
  clientNotificationColumns,
} from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { conversation, conversationMessage, notification } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";
import { fynixRead } from "@/server/domain/fynix-write";

export interface MessagingActor {
  readonly userId: string;
  readonly orgId?: string | null;
  readonly orgKind: "client" | "agency" | "fynix";
  readonly role?: "member" | "manager";
  readonly displayName?: string;
}

const fynixConversationColumns = {
  id: conversation.id,
  publicRef: conversation.publicRef,
  campaignId: conversation.campaignId,
  leadId: conversation.leadId,
  side: conversation.side,
  clientOrgId: conversation.clientOrgId,
  coordinatorOrgId: conversation.coordinatorOrgId,
  agencyOrgId: conversation.agencyOrgId,
  subject: conversation.subject,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
} as const;

const fynixConversationMessageColumns = {
  id: conversationMessage.id,
  conversationId: conversationMessage.conversationId,
  senderUserId: conversationMessage.senderUserId,
  senderOrgId: conversationMessage.senderOrgId,
  senderRole: conversationMessage.senderRole,
  senderName: conversationMessage.senderName,
  body: conversationMessage.body,
  forwardOfMessageId: conversationMessage.forwardOfMessageId,
  scrubbedCount: conversationMessage.scrubbedCount,
  createdAt: conversationMessage.createdAt,
} as const;

const fynixNotificationColumns = {
  id: notification.id,
  userId: notification.userId,
  orgId: notification.orgId,
  kind: notification.kind,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  leadId: notification.leadId,
  meetingId: notification.meetingId,
  campaignId: notification.campaignId,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
} as const;

export function conversationColumnsFor(orgKind: "client" | "agency" | "fynix") {
  if (orgKind === "client") return clientConversationColumns;
  if (orgKind === "agency") return agencyConversationColumns;
  return fynixConversationColumns;
}

export function messageColumnsFor(orgKind: "client" | "agency" | "fynix") {
  if (orgKind === "client") return clientConversationMessageColumns;
  if (orgKind === "agency") return agencyConversationMessageColumns;
  return fynixConversationMessageColumns;
}

export function notificationColumnsFor(orgKind: "client" | "agency" | "fynix") {
  if (orgKind === "client") return clientNotificationColumns;
  if (orgKind === "agency") return agencyNotificationColumns;
  return fynixNotificationColumns;
}

/**
 * Asserts that the actor is authorized to read or write to this conversation.
 * Respects strict boundary isolation: Fynix cannot access supplier_agency conversations.
 */
export function assertConversationAccess(
  actor: MessagingActor,
  conv: {
    side: string;
    clientOrgId: string | null;
    coordinatorOrgId: string | null;
    agencyOrgId: string | null;
  },
): void {
  // A group conversation only reaches this point for a member: the row policy has already decided who may see it.
  if (conv.side === "group") return;

  if (actor.orgKind === "fynix") {
    if (conv.side === "supplier_agency") {
      throw new DomainError("not-authorised", "Fynix cannot access coordinator-agency conversations.");
    }
    if (conv.side !== "client_fynix" && conv.side !== "supplier_fynix") {
      throw new DomainError("not-authorised", "Not authorised to access this conversation.");
    }
    return;
  }

  if (actor.orgKind === "client") {
    if (conv.side !== "client_fynix") {
      throw new DomainError("not-authorised", "Client can only access client-fynix conversations.");
    }
    if (actor.orgId && conv.clientOrgId !== actor.orgId) {
      throw new DomainError("not-authorised", "Not authorised to access conversations of another client organisation.");
    }
    return;
  }

  if (actor.orgKind === "agency") {
    if (conv.side === "client_fynix") {
      throw new DomainError("not-authorised", "Agencies cannot access client-fynix conversations.");
    }
    if (conv.side === "supplier_fynix") {
      if (actor.orgId && conv.coordinatorOrgId !== actor.orgId) {
        throw new DomainError("not-authorised", "Not authorised to access conversations of another coordinator organisation.");
      }
      return;
    }
    if (conv.side === "supplier_agency") {
      if (actor.orgId && conv.coordinatorOrgId !== actor.orgId && conv.agencyOrgId !== actor.orgId) {
        throw new DomainError("not-authorised", "Not authorised to access conversations of another organisation.");
      }
      return;
    }
  }

  throw new DomainError("not-authorised", "Unknown actor role or conversation side.");
}

export async function withActorScope<T>(
  db: Database,
  actor: MessagingActor,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  if (actor.orgKind === "fynix") {
    return fynixRead(db, { userId: actor.userId }, work);
  }
  return withTenantScope(db, { orgId: actor.orgId ?? "", userId: actor.userId }, work);
}
