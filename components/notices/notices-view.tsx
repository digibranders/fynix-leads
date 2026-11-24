import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { TabNav } from "@/components/kit/tab-nav";
import type { NoticeView } from "@/lib/leads/notice-display";
import { NoticesListClient } from "./notices-list";

export type NoticesTab = "all" | "unread";

/** The `?show=` of the address: unread, or everything. */
export function parseNoticesTab(value: string | string[] | undefined): NoticesTab {
  return value === "unread" ? "unread" : "all";
}

/**
 * The full Notices page of a portal: the latest notices with All and Unread tabs. The same page serves all four portals; `basePath` is the portal's own
 * `/notices` address. What each person may read is the database's row policy, so nothing here filters by role.
 */
export function NoticesView({ basePath, tab, notices, unreadTotal, now }: { readonly basePath: string; readonly tab: NoticesTab; readonly notices: readonly NoticeView[]; readonly unreadTotal: number; readonly now: Date }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Notices" description={unreadTotal === 0 ? "Everything is read." : `${unreadTotal} unread.`} />
      <Panel aria-label="Notices">
        <TabNav
          label="Notices"
          items={[
            { label: "All", href: basePath, active: tab === "all" },
            { label: "Unread", href: `${basePath}?show=unread`, active: tab === "unread", count: unreadTotal },
          ]}
        />
        <NoticesListClient
          notices={notices}
          nowIso={now.toISOString()}
          anyUnread={notices.some((notice) => !notice.read)}
          emptyText={tab === "unread" ? "No unread notices." : "No notices yet. What happens on your leads and campaigns appears here."}
        />
      </Panel>
    </div>
  );
}
