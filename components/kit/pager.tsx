import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous and next as links, with a plain count. A link that has nowhere to go is a disabled-looking span, not a dead button. */
export function Pager({ from, to, total, prevHref, nextHref }: { from: number; to: number; total: number; prevHref?: string; nextHref?: string }) {
  const off = "pointer-events-none opacity-50";
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <p className="text-label text-ink-muted">
        {total === 0 ? "No results" : `Showing ${from} to ${to} of ${total}`}
      </p>
      <div className="flex gap-1.5">
        {prevHref ? (
          <Link href={prevHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Previous
          </Link>
        ) : (
          <span aria-disabled className={cn(buttonVariants({ variant: "secondary", size: "sm" }), off)}>Previous</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Next
          </Link>
        ) : (
          <span aria-disabled className={cn(buttonVariants({ variant: "secondary", size: "sm" }), off)}>Next</span>
        )}
      </div>
    </div>
  );
}
