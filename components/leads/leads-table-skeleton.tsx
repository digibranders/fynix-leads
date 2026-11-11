import { Skeleton } from "@/components/ui/skeleton";

const ROWS = 8;

/** Loading shape for the agency leads panel: the toolbar and a few rows, without content. */
export function LeadsTableSkeleton() {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-lg bg-surface px-2 pb-2.5 shadow-raised">
      <div className="flex min-h-[68px] flex-wrap items-center gap-4 py-3 pr-1.5 pl-3.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-8 rounded-full" />
        <Skeleton className="h-[38px] w-full max-w-[560px] rounded-full xl:ml-auto" />
        <Skeleton className="h-10 w-full rounded-sm md:w-[252px]" />
      </div>
      <Skeleton className="h-[38px] rounded-sm" />
      {Array.from({ length: ROWS }, (_, i) => (
        <div key={i} className="flex h-[50px] items-center gap-6 px-3.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-36 max-md:hidden" />
          <Skeleton className="h-[22px] w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}
