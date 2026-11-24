import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import {
  conversation,
  conversationMessage,
  notification,
  type ConversationSide,
} from "@/server/db/schema";
import { DomainError } from "@/server/domain/errors";
import { markConversationReadSchema, markNotificationReadSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { assertConversationAccess, conversationColumnsFor, messageColumnsFor, notificationColumnsFor, withActorScope, type MessagingActor } from "@/server/domain/messaging-core";
/**
 * Lists conversations visible to the actor.
 */
export async function listConversations(
  db: Database,
  actor: MessagingActor,
  filters?: { campaignId?: string; leadId?: string; side?: ConversationSide },
) {
  const cols = conversationColumnsFor(actor.orgKind);

  return withActorScope(db, actor, async (tx) => {
    const conditions = [];

    if (actor.orgKind === "fynix") {
      conditions.push(inArray(conversation.side, ["client_fynix", "supplier_fynix", "group"]));
    } else if (actor.orgKind === "client") {
      conditions.push(or(and(eq(conversation.side, "client_fynix"), eq(conversation.clientOrgId, actor.orgId ?? "")), eq(conversation.side, "group")));
    } else if (actor.orgKind === "agency") {
      conditions.push(
        or(
          eq(conversation.side, "group"),
          and(
            eq(conversation.supplierOrgId, actor.orgId ?? ""),
            inArray(conversation.side, ["supplier_fynix", "supplier_agency"]),
          ),
          and(
            eq(conversation.agencyOrgId, actor.orgId ?? ""),
            eq(conversation.side, "supplier_agency"),
          ),
        ),
      );
    }

    if (filters?.campaignId) conditions.push(eq(conversation.campaignId, filters.campaignId));
    if (filters?.leadId) conditions.push(eq(conversation.leadId, filters.leadId));
    if (filters?.side) conditions.push(eq(conversation.side, filters.side));

    const rows = await tx
      .select(cols)
      .from(conversation)
      .where(and(...conditions))
      .orderBy(desc(conversation.updatedAt));

    // A chat between two people is titled with the other person's first name, which differs for each of them.
    const groupIds = rows.filter((row) => row.side === "group").map((row) => row.id);
    const titles = new Map<string, string>();
    if (groupIds.length > 0) {
      const result = await tx.execute<{ id: string; title: string | null }>(
        sql`select id, public.app_direct_title(id) as title from unnest(${`{${groupIds.join(",")}}`}::uuid[]) as id`,
      );
      for (const row of result.rows) if (row.title !== null) titles.set(row.id, row.title);
    }
    return rows.map((row) => ({ ...row, subject: titles.get(row.id) ?? row.subject, isDirect: titles.has(row.id) }));
  });
}

/**
 * Lists all messages in a conversation, verifying actor access first.
 */
export async function listConversationMessages(
  db: Database,
  actor: MessagingActor,
  conversationId: string,
) {
  const cols = messageColumnsFor(actor.orgKind);

  return withActorScope(db, actor, async (tx) => {
    const [conv] = await tx
      .select({
        id: conversation.id,
        side: conversation.side,
        clientOrgId: conversation.clientOrgId,
        supplierOrgId: conversation.supplierOrgId,
        agencyOrgId: conversation.agencyOrgId,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (conv === undefined) {
      throw new DomainError("not-found", "There is no such conversation.");
    }

    assertConversationAccess(actor, conv);

    return tx
      .select(cols)
      .from(conversationMessage)
      .where(eq(conversationMessage.conversationId, conversationId))
      .orderBy(asc(conversationMessage.createdAt));
  });
}

/**
 * Lists notifications for the user.
 */
export async function listUserNotifications(
  db: Database,
  actor: MessagingActor,
  options?: { unreadOnly?: boolean },
) {
  const cols = notificationColumnsFor(actor.orgKind);

  return withActorScope(db, actor, async (tx) => {
    const conditions = [eq(notification.userId, actor.userId)];
    if (options?.unreadOnly) {
      conditions.push(isNull(notification.readAt));
    }

    return tx
      .select(cols)
      .from(notification)
      .where(and(...conditions))
      .orderBy(desc(notification.createdAt));
  });
}

/**
 * Marks a notification as read.
 */
export async function markNotificationRead(
  db: Database,
  actor: MessagingActor,
  notificationId: string,
  deps?: { now?: () => Date },
) {
  const parsed = parseInput(markNotificationReadSchema, { notificationId });
  const now = deps?.now ? deps.now() : new Date();
  const cols = notificationColumnsFor(actor.orgKind);

  return withActorScope(db, actor, async (tx) => {
    const [existing] = await tx
      .select({ id: notification.id, userId: notification.userId })
      .from(notification)
      .where(and(eq(notification.id, parsed.notificationId), eq(notification.userId, actor.userId)))
      .limit(1);

    if (existing === undefined) {
      throw new DomainError("not-found", "There is no such notification.");
    }

    const [updated] = await tx
      .update(notification)
      .set({ readAt: now })
      .where(eq(notification.id, parsed.notificationId))
      .returning(cols);

    return updated;
  });
}

/** Records that the person has opened a conversation they belong to. Anything else is ignored by the database (migration 0049). */
export async function markConversationRead(db: Database, actor: MessagingActor, conversationId: string): Promise<void> {
  parseInput(markConversationReadSchema, { conversationId });
  await withActorScope(db, actor, async (tx) => {
    await tx.execute(sql`select public.app_mark_conversation_read(${conversationId}::uuid)`);
  });
}

/** The latest moment someone on the other side opened the conversation, or null. A message sent before this has been seen. */
export async function getConversationSeenAt(db: Database, actor: MessagingActor, conversationId: string): Promise<Date | null> {
  parseInput(markConversationReadSchema, { conversationId });
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ seen: string | Date | null }>(sql`select public.app_conversation_seen_at(${conversationId}::uuid) as seen`);
    const seen = result.rows[0]?.seen ?? null;
    return seen === null ? null : new Date(seen);
  });
}
