import { Skeleton } from "@/components/ui/skeleton";

/** A page header's loading shape: a title and a line under it. */
export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2 pb-1">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** A panel with a toolbar, column heads and rows, the shape of every list screen. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-lg bg-surface pb-3 shadow-raised">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <Skeleton className="h-(--h-control) w-full md:w-[320px]" />
        <Skeleton className="h-4 w-16 max-md:hidden" />
      </div>
      <div className="px-2.5">
        <Skeleton className="h-9" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[52px] items-center gap-4 px-4">
            <Skeleton className="size-[30px] shrink-0" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="ml-auto h-3.5 w-20 max-md:hidden" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A whole page while its data loads: the header, a card for the hero or filter, then a list. The default fallback of a page's own Suspense boundary. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <HeaderSkeleton />
      <Skeleton className="h-32 rounded-lg" />
      <TableSkeleton rows={rows} />
    </div>
  );
}
