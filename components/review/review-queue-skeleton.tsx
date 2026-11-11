import { Skeleton } from "@/components/ui/skeleton";

const ROWS = 6;

/** Loading shape for the review queue: the real list rows and lead pane layout, without content. */
export function ReviewQueueSkeleton() {
  return (
    <div
      aria-busy="true"
      className="grid overflow-hidden rounded-lg border bg-card lg:h-[calc(100dvh-7rem)] lg:min-h-[32rem] grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]"
    >
      <div className="flex min-h-0 flex-col lg:border-r">
        <div className="flex items-baseline justify-between border-b px-4 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="divide-y">
          {Array.from({ length: ROWS }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-col gap-6 px-6 py-5 lg:flex">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex flex-col gap-3 border-t pt-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="flex flex-col gap-3 border-t pt-5">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
