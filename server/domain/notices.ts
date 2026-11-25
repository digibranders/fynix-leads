import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { campaignNotices, leadNotices, type CampaignNoticeEvent, type LeadNoticeEvent, type NoticeDelivery } from "@/lib/leads/notices";
import type { Database } from "@/server/db/pool";
import { notification } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { notificationColumnsFor, withActorScope, type MessagingActor } from "@/server/domain/messaging-core";
import { markNotificationReadSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { claimTargetNotices, enqueueCampaignEmails, enqueueLeadEmails } from "@/server/mail/lead-emails";

/**
 * Notices in the app (phase 5). `notify(tx, event)` is the one call every domain function that changes a lead, a meeting or a campaign makes inside its own
 * transaction, after the history row. What it says and to whom is the catalogue in `lib/leads/notices.ts`; who the people are, and whether the caller may
 * speak about this lead at all, is decided by the database functions `app_notify_lead` and `app_notify_campaign` (migration 0071), because a tenant role
 * can neither read the other side's people nor write a notice for them. The person who acted is never told: the function leaves out the caller.
 * The emails of the same event are queued right after the notices by `enqueueLeadEmails` (server/mail/lead-emails.ts), and only when the launch switch is on.
 */
export type NotifyEvent = (LeadNoticeEvent & { readonly leadId: string; readonly meetingId?: string }) | (CampaignNoticeEvent & { readonly campaignId: string });

/** A Postgres text[] literal. The audience values are fixed words from the catalogue, never input. */
const textArray = (values: readonly string[]) => `{${values.join(",")}}`;

export async function notify(tx: ScopedTransaction, event: NotifyEvent): Promise<void> {
  if ("leadId" in event) {
    const { leadId, meetingId, ...rest } = event;
    const meeting = meetingId ?? null;
    for (const delivery of leadNotices(rest)) {
      await tx.execute(sql`select public.app_notify_lead(${leadId}::uuid, ${textArray(delivery.audience)}::text[], ${delivery.kind}, ${delivery.title}, ${delivery.body}, ${meeting}::uuid)`);
    }
    // The emails of the same event (phase 6), in the same transaction. Nothing happens while LAUNCH_EMAILS_ENABLED is not true.
    await enqueueLeadEmails(tx, { ...rest, leadId });
    // These are the events after which a lead can count where it did not before, so a target may just have been met. (The sweep does the same after an
    // automatic acceptance.) The database decides, says each target once and writes its notice; the email follows when the launch switch is on.
    if (rest.type === "lead_accepted" || rest.type === "rejection_overturned" || rest.type === "contest_decided" || (rest.type === "outcome_recorded" && rest.outcome === "client_no_show")) {
      await claimTargetNotices(tx, leadId);
    }
    return;
  }
  const { campaignId, ...rest } = event;
  for (const delivery of campaignNotices(rest) as readonly NoticeDelivery[]) {
    await tx.execute(sql`select public.app_notify_campaign(${campaignId}::uuid, ${textArray(delivery.audience)}::text[], ${delivery.kind}, ${delivery.title}, ${delivery.body}, ${delivery.target})`);
  }  await enqueueCampaignEmails(tx, { ...rest, campaignId });
}

/**
 * The number of notices the person has not opened, for the bell. One query over their own rows. Notices of new messages are left out: the Messages and
 * Inbox badge (`countUnreadMessages`) counts those.
 */
export async function countUnreadNotices(db: Database, actor: MessagingActor): Promise<number> {
  return withActorScope(db, actor, async (tx) => {
    const [row] = await tx
      .select({ unread: sql<number>`count(*)::int` })
      .from(notification)
      .where(and(eq(notification.userId, actor.userId), isNull(notification.readAt), ne(notification.kind, "message_received")));
    return row?.unread ?? 0;
  });
}

/** The number of conversations the person can see in which someone else wrote after they last opened it, for the Messages and Inbox badge. One query. */
export async function countUnreadMessages(db: Database, actor: MessagingActor): Promise<number> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ unread: number }>(sql`select public.app_unread_conversation_count() as unread`);
    return result.rows[0]?.unread ?? 0;
  });
}

/** The most notices one list returns: the bell shows a handful, the page the latest of them. */
export const NOTICE_LIST_MAX = 100;

/**
 * The person's own notices, newest first: all of them, message notices included (those link to the thread). Only their own rows are visible, so there is
 * nothing to filter by person; the database's row policy is the rule.
 */
export async function listNotices(db: Database, actor: MessagingActor, options: { readonly limit?: number; readonly unreadOnly?: boolean } = {}) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), NOTICE_LIST_MAX);
  const cols = notificationColumnsFor(actor.orgKind);
  return withActorScope(db, actor, async (tx) => {
    const conditions = [eq(notification.userId, actor.userId)];
    if (options.unreadOnly === true) conditions.push(isNull(notification.readAt));
    return tx.select(cols).from(notification).where(and(...conditions)).orderBy(desc(notification.createdAt)).limit(limit);
  });
}

/** Opens one of the person's own notices. One that is already read keeps the time it was first read; one that is not theirs changes nothing. */
export async function markNoticeRead(db: Database, actor: MessagingActor, noticeId: string, deps: { readonly now?: () => Date } = {}): Promise<void> {
  const parsed = parseInput(markNotificationReadSchema, { notificationId: noticeId });
  const now = deps.now?.() ?? new Date();
  await withActorScope(db, actor, async (tx) => {
    await tx.update(notification).set({ readAt: now }).where(and(eq(notification.id, parsed.notificationId), eq(notification.userId, actor.userId), isNull(notification.readAt)));
  });
}

/** Marks every unread notice of the person as read, message notices included. */
export async function markAllNoticesRead(db: Database, actor: MessagingActor, deps: { readonly now?: () => Date } = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await withActorScope(db, actor, async (tx) => {
    await tx.update(notification).set({ readAt: now }).where(and(eq(notification.userId, actor.userId), isNull(notification.readAt)));
  });
}

/** What the shell shows: the bell's unread notices, and the unread conversations for the Messages or Inbox badge. */
export async function loadShellCounts(db: Database, actor: MessagingActor): Promise<{ readonly notices: number; readonly messages: number }> {
  const [notices, messages] = await Promise.all([countUnreadNotices(db, actor), countUnreadMessages(db, actor)]);
  return { notices, messages };
}
