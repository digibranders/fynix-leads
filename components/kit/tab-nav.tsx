import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabNavItem {
  readonly label: string;
  readonly href: string;
  readonly count?: number;
  readonly active: boolean;
}

/** Underline tabs as links, with a count beside each label. The selected tab lives in the URL, so a view can be shared and the back button works. */
export function TabNav({ items, label }: { items: readonly TabNavItem[]; label: string }) {
  return (
    <nav aria-label={label} className="flex h-10 max-w-full gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 rounded-xs px-2.5 text-[13px] font-semibold transition-colors after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-peach after:transition-opacity",
            item.active ? "text-ink after:opacity-100" : "text-ink-muted after:opacity-0 hover:text-ink",
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className={cn("text-xs", item.active ? "text-ink" : "text-ink-muted")}>{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
