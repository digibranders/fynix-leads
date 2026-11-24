import Link from "next/link";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { GROUP_RULE_TEXT } from "@/lib/messaging/group-rules";
import type { MixedGroup } from "@/server/domain/groups";

/**
 * Groups made before groups were limited to one side, that still hold more than one. The owner repairs them: nothing is changed or removed here. A group is
 * private to its members, so it opens from the Inbox of a Fynix person who is in it (search the Inbox for its name).
 */
export function GroupsToReview({ groups }: { readonly groups: readonly MixedGroup[] }) {
  return (
    <Panel aria-label="Groups to review">
      <PanelHeader title="Groups to review" count={groups.length} />
      {groups.length === 0 ? (
        <EmptyState icon={UsersThree} title="No group needs review">
          Every group holds Fynix and one side. {GROUP_RULE_TEXT}
        </EmptyState>
      ) : (
        <>
          <p className="px-5 pb-1 text-body text-ink-muted">These groups hold more than one side. {GROUP_RULE_TEXT} Remove the people of one side from each, or delete the group.</p>
          <ul className="flex flex-col pb-3">
            {groups.map((group) => (
              <ListRow
                key={group.groupId}
                title={group.name}
                sub={`${group.sides.join(", ")}. ${group.memberCount} ${group.memberCount === 1 ? "person" : "people"}.`}
                trailing={
                  <Link href="/fynix/inbox" className={buttonVariants({ variant: "secondary", size: "xs" })}>
                    Open in Inbox
                  </Link>
                }
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
