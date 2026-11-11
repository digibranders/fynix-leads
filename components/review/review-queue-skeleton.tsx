import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ROWS = 6;

/** Loading shape for the review queue: the tonal list pane and the white lead panel, without content. */
export function ReviewQueueSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "grid grid-cols-1 gap-4 lg:h-[calc(100dvh-117px)] lg:min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[372px_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-col rounded-lg bg-tonal px-2 max-lg:pb-2">
        <div className="flex h-14 items-center justify-between pr-1 pl-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <Skeleton className="mx-1 mb-2 h-[38px] rounded-full" />
        <div className="overflow-hidden">
          {Array.from({ length: ROWS }, (_, i) => (
            <div key={i} className="flex h-[96px] flex-col justify-center gap-1.5 px-[18px]">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="hidden min-h-0 flex-col overflow-hidden rounded-lg bg-surface shadow-raised lg:flex">
        <div className="flex flex-1 flex-col gap-5 px-7 pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-[26px] w-32 rounded-full" />
            <Skeleton className="h-[26px] w-20 rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3">
            <Skeleton className="h-44 rounded-md" />
            <Skeleton className="h-44 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </div>
        </div>
        <div className="flex h-[76px] items-center gap-2.5 bg-navy-04 px-6">
          <Skeleton className="h-11 w-32 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-52 rounded-full" />
        </div>
      </div>
    </div>
  );
}
