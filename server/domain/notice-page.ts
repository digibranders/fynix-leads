import type { NoticeView } from "@/lib/leads/notice-display";
import type { Database } from "@/server/db/pool";
import type { MessagingActor } from "@/server/domain/messaging-core";
import { listNotices, NOTICE_LIST_MAX } from "@/server/domain/notices";

/**
 * The data of the Notices page, shared by the four portals: the latest notices of the tab, and how many are unread. Unlike the bell's badge, the page counts
 * message notices too, because it lists them; the Unread tab and its count agree.
 */
export async function loadNoticesPage(db: Database, actor: MessagingActor, unreadOnly: boolean): Promise<{ readonly notices: readonly NoticeView[]; readonly unreadTotal: number }> {
  const unread = await listNotices(db, actor, { limit: NOTICE_LIST_MAX, unreadOnly: true });
  const rows = unreadOnly ? unread : await listNotices(db, actor, { limit: NOTICE_LIST_MAX });
  return {
    unreadTotal: unread.length,
    notices: rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, read: row.readAt !== null, createdAt: row.createdAt.toISOString() })),
  };
}
