import { Skeleton } from "@/components/ui/skeleton";

/** The header's loading shape: a title and a line under it. */
export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2 pb-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

function RowSkeleton({ two = false }: { two?: boolean }) {
  return (
    <div className="flex items-center gap-6 px-3.5 max-md:h-[68px] md:h-[50px]">
      <Skeleton className="h-3 w-16 max-md:hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-40 max-w-full" />
        {two && <Skeleton className="h-3 w-28 md:hidden" />}
      </div>
      <Skeleton className="h-3 w-8 max-md:hidden" />
      <Skeleton className="h-3 w-8 max-md:hidden" />
      <Skeleton className="h-3 w-8" />
    </div>
  );
}

/** A table card: the toolbar, the column heads and a few rows. */
export function TableCardSkeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={`overflow-hidden rounded-lg bg-surface px-2 pb-3 shadow-raised ${className}`}>
      <div className="flex flex-wrap items-center gap-3 px-3.5 pt-4 pb-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-6 w-8 rounded-full" />
        <Skeleton className="h-[38px] w-44 rounded-full md:ml-auto" />
        <Skeleton className="h-10 w-full rounded-full md:w-[280px]" />
      </div>
      <Skeleton className="h-[38px] rounded-sm" />
      {Array.from({ length: rows }, (_, index) => (
        <RowSkeleton key={index} two />
      ))}
    </div>
  );
}

/** The side panel's loading shape, shown from `xl` where it is a column. Below that the panel is an overlay, which has nothing to hold a place for. */
export function PanelSkeleton() {
  return (
    <div aria-busy="true" className="hidden flex-col gap-3 rounded-lg bg-surface p-5 shadow-raised xl:flex">
      <div className="flex gap-1.5">
        <Skeleton className="h-[26px] w-20 rounded-full" />
        <Skeleton className="h-[26px] w-24 rounded-full" />
      </div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-36 rounded-md" />
      <Skeleton className="h-44 rounded-md" />
    </div>
  );
}

/** The table and, where the screen has one, the panel's column. The page's own header is already on screen, so it is not repeated. */
export function ListBodySkeleton({ withPanel = false }: { withPanel?: boolean }) {
  return (
    <div className={withPanel ? "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-4" : ""}>
      <TableCardSkeleton />
      {withPanel && <PanelSkeleton />}
    </div>
  );
}

/** The whole Suppliers or Campaigns screen while a navigation to it loads. */
export function ListScreenSkeleton({ withPanel = false }: { withPanel?: boolean }) {
  return (
    <div>
      <HeaderSkeleton />
      <ListBodySkeleton withPanel={withPanel} />
    </div>
  );
}

/** A card of the campaign tabs: a heading, a few tiles and a few lines. */
export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-busy="true" className={`flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised ${className}`}>
      <Skeleton className="h-6 w-56" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

/** The campaign header and tabs while the campaign loads. */
export function CampaignHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3 pb-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="h-6 w-96 max-w-full" />
      <Skeleton className="h-[42px] w-full rounded-full" />
    </div>
  );
}

/** The shell while the session is read: the rail's place and the canvas. */
export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-canvas">
      <div aria-hidden className="h-[60px] bg-navy md:hidden" />
      <div aria-hidden className="fixed inset-y-3 left-3 w-[72px] rounded-xl bg-navy max-md:hidden lg:w-[220px]" />
      <div className="px-4 pt-5 md:pr-6 md:pl-[100px] lg:pl-[248px]">
        <div aria-busy="true" className="mx-auto w-full max-w-[1400px]">
          <HeaderSkeleton />
        </div>
      </div>
    </div>
  );
}
