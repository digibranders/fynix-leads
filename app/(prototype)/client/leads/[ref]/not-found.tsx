import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export default function LeadNotFound() {
  return (
    <>
      <PageHeader title="Lead record" />
      <div className="flex min-h-[22rem] flex-col items-center justify-center gap-5 rounded-lg bg-surface px-6 py-12 text-center shadow-raised">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-navy-05 text-ink-2">
          <MagnifyingGlass size={22} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[18px] leading-6 font-semibold">Lead not found</h2>
          <p className="max-w-sm text-body text-ink-2 text-pretty">
            No lead has that reference. Check the reference in the address, or open the lead from the review queue.
          </p>
        </div>
        <Button variant="secondary" nativeButton={false} render={<Link href="/client/review" />}>
          Back to review queue
        </Button>
      </div>
    </>
  );
}
