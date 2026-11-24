"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/domain/errors";
import { listNotices, markAllNoticesRead, markNoticeRead } from "@/server/domain/notices";
import { searchEverything, type SearchResults } from "@/server/domain/search";
import { currentMessagingActor } from "@/server/tenant/session-actor";
import type { NoticeView } from "@/lib/leads/notice-display";

/** How many notices the bell lists. The page behind "See all" lists more. */
const BELL_LIMIT = 8;

/** The shell of every portal shows the counts, and a layout does not run again on navigation, so a change to a notice refreshes all four. */
function refreshShell(): void {
  for (const home of ["/client", "/supplier", "/agency", "/fynix"]) revalidatePath(home, "layout");
}

/** The latest notices of the signed-in person, for the bell. Nothing when nobody is signed in. */
export async function loadNoticesAction(): Promise<readonly NoticeView[]> {
  const session = await currentMessagingActor();
  if (session === null) return [];
  const rows = await listNotices(session.db, session.actor, { limit: BELL_LIMIT });
  return rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, read: row.readAt !== null, createdAt: row.createdAt.toISOString() }));
}

/** Marks one notice read. The page it opens is the link the notice already carries; the browser follows it, never this action. */
export async function markNoticeReadAction(noticeId: string): Promise<void> {
  const session = await currentMessagingActor();
  if (session === null) return;
  try {
    await markNoticeRead(session.db, session.actor, noticeId);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return;
  }
  refreshShell();
}

export async function markAllNoticesReadAction(): Promise<void> {
  const session = await currentMessagingActor();
  if (session === null) return;
  await markAllNoticesRead(session.db, session.actor);
  refreshShell();
}

/** The palette's search. Only the text comes from the browser: who is asking, and so what they may find, comes from the session. */
export async function searchEverythingAction(query: string): Promise<SearchResults> {
  const session = await currentMessagingActor();
  if (session === null) return { leads: [], people: [], companies: [] };
  try {
    return await searchEverything(session.db, session.actor, query);
  } catch (error) {
    if (error instanceof DomainError) return { leads: [], people: [], companies: [] };
    throw error;
  }
}
