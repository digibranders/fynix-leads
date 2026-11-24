import Link from "next/link";
import { initialsOf } from "@/lib/auth/display";
import { cn } from "@/lib/utils";

/** A person in a table or a list: initials in a soft tile, the name, and one muted line (a title, a company). */
export function Person({ name, sub, className, href }: { name: string; sub?: React.ReactNode; className?: string; /** Makes the whole row (a `relative` table row or list item) a link to a record. */ href?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-sm bg-navy-06 text-[11px] font-semibold text-ink-2">
        {initialsOf(name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold text-ink">
          {href === undefined ? (
            name
          ) : (
            <Link href={href} className="rounded-xs after:absolute after:inset-0 after:content-['']">
              {name}
            </Link>
          )}
        </span>
        {sub ? <span className="block truncate text-caption text-ink-muted">{sub}</span> : null}
      </span>
    </span>
  );
}
