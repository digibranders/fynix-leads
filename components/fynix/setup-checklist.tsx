import { CheckCircle, ListChecks } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { checklistTitle, type ChecklistItem } from "@/lib/fynix/setup-checklist";

/**
 * What still needs set-up on the Fynix overview, one line per item, each linking to the page that fixes it. With nothing open it is a
 * single quiet line, so the overview stays calm.
 */
export function SetupChecklist({ items }: { items: readonly ChecklistItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 px-1 text-body text-ink-muted">
        <CheckCircle aria-hidden size={18} weight="fill" className="text-green-text" />
        {checklistTitle(items)}
      </p>
    );
  }
  return (
    <Panel aria-label="Set-up checklist">
      <PanelHeader title="Set-up checklist" count={items.length} />
      <ul className="flex flex-col pb-3">
        {items.map((item) => (
          <ListRow
            key={item.key}
            leading={<ListChecks aria-hidden size={18} className="shrink-0 text-ink-2" />}
            title={
              <Link href={item.href} className="rounded-xs hover:underline">
                {item.label}
              </Link>
            }
          />
        ))}
      </ul>
    </Panel>
  );
}
