"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NoticeList } from "@/components/shell/notice-list";
import type { NoticeView } from "@/lib/leads/notice-display";
import { markAllNoticesReadAction, markNoticeReadAction } from "@/server/domain/notice-actions";

/** The list on the Notices page. Opening a notice marks it read; "Mark all read" clears the lot. The server renders the page again afterwards. */
export function NoticesListClient({ notices, nowIso, anyUnread, emptyText }: { readonly notices: readonly NoticeView[]; readonly nowIso: string; readonly anyUnread: boolean; readonly emptyText: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 p-2">
      {anyUnread ? (
        <div className="flex justify-end px-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNoticesReadAction();
                router.refresh();
              })
            }
          >
            Mark all read
          </Button>
        </div>
      ) : null}
      <NoticeList notices={notices} now={new Date(nowIso)} emptyText={emptyText} onOpen={(notice) => void markNoticeReadAction(notice.id)} />
    </div>
  );
}
