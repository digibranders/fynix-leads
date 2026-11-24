"use client";

import { BellSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { relativeTime, safeNoticeLink, type NoticeView } from "@/lib/leads/notice-display";
import { cn } from "@/lib/utils";

/**
 * One notice: an unread dot, the title, a line of text and how long ago. The whole row is a link to the page the notice is about (a message notice links to
 * its thread), so a modified click still opens a new tab. `onOpen` runs on the click, to mark the notice read.
 */
export function NoticeItem({ notice, now, onOpen }: { readonly notice: NoticeView; readonly now: Date; readonly onOpen?: (notice: NoticeView) => void }) {
  const href = safeNoticeLink(notice.link) ?? "/";
  return (
    <li>
      <Link
        href={href}
        onClick={() => onOpen?.(notice)}
        className={cn("flex items-start gap-3 rounded-md px-3 py-2.5 outline-offset-[-2px] transition-colors hover:bg-navy-05", !notice.read && "bg-selected hover:bg-selected")}
      >
        <span aria-hidden={notice.read} aria-label={notice.read ? undefined : "Unread"} className={cn("mt-[7px] size-2 shrink-0 rounded-full", notice.read ? "bg-transparent" : "bg-peach")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-row text-ink", notice.read ? "font-medium" : "font-semibold")}>{notice.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-table text-ink-2">{notice.body}</span>
          <time dateTime={notice.createdAt} className="mt-1 block text-caption text-ink-muted" suppressHydrationWarning>
            {relativeTime(new Date(notice.createdAt), now)}
          </time>
        </span>
      </Link>
    </li>
  );
}

/** The notices as a list, or a calm line when there are none. Used by the bell and by the Notices page. */
export function NoticeList({ notices, now, onOpen, emptyText = "No notices yet." }: { readonly notices: readonly NoticeView[]; readonly now: Date; readonly onOpen?: (notice: NoticeView) => void; readonly emptyText?: string }) {
  if (notices.length === 0) {
    return (
      <p className="flex flex-col items-center gap-2 px-6 py-10 text-center text-table text-ink-muted">
        <BellSimple aria-hidden size={22} />
        {emptyText}
      </p>
    );
  }
  return (
    <ul aria-label="Notices" className="flex flex-col gap-0.5">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} now={now} onOpen={onOpen} />
      ))}
    </ul>
  );
}
