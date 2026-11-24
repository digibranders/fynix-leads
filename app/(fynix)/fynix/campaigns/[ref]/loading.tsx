import { HeaderSkeleton, TableSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <HeaderSkeleton />
      <TableSkeleton rows={4} />
    </div>
  );
}
