import { Skeleton } from "@/components/ui/skeleton";

/** What shows while a layout resolves the session: the sidebar's shape on navy, the top strip, and a page header with two cards. */
export function ShellSkeleton() {
  return (
    <div aria-busy="true" className="min-h-dvh bg-canvas">
      <div className="fixed inset-y-0 left-0 flex w-(--sidebar-w) flex-col gap-5 bg-navy px-3 pt-4 max-md:hidden">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="size-7 rounded-sm bg-peach/70" />
          <div className="h-4 w-24 rounded-xs bg-on-navy-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-9 rounded-sm bg-on-navy-05" />
          ))}
        </div>
      </div>
      <div className="md:pl-(--sidebar-w)">
        <div className="flex h-(--topbar-h) items-center justify-between px-4 md:px-7">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-(--h-control) w-[300px] max-md:hidden" />
        </div>
        <div aria-hidden className="glass-ink fixed inset-x-3.5 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--tabbar-gap))] z-40 h-(--tabbar-h) rounded-[34px] md:hidden" />
        <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4 px-4 pt-1 md:px-7">
          <div className="flex flex-col gap-2 pb-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
