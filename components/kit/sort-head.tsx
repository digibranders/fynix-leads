import Link from "next/link";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react/dist/ssr";
import { TableHead } from "@/components/ui/table";
import { nextSortValue, type Sort, type SortKey } from "@/lib/leads/sort";
import { cn } from "@/lib/utils";

/**
 * A column header that sorts the table: a link that sets `?sort=` and keeps every other filter (`hrefFor` builds the address from the new value).
 * The current column shows its direction. Plain links, so sorting works without script and the order can be shared.
 */
export function SortHead({
  label,
  sortKey,
  sort,
  hrefFor,
  className,
}: {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly sort: Sort | null;
  readonly hrefFor: (sortValue: string) => string;
  readonly className?: string;
}) {
  const active = sort?.key === sortKey;
  const Caret = !active ? CaretUpDown : sort.dir === "asc" ? CaretUp : CaretDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={hrefFor(nextSortValue(sort, sortKey))} className={cn("inline-flex items-center gap-1 rounded-xs hover:text-ink", active ? "text-ink" : "")}>
        {label}
        <Caret aria-hidden size={12} weight="bold" className={active ? "" : "text-ink-muted"} />
      </Link>
    </TableHead>
  );
}
