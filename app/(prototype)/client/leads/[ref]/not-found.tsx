import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LeadNotFound() {
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-lg border bg-card px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Lead not found</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          No lead has that reference. Check the reference in the address, or open the lead from the review queue.
        </p>
      </div>
      <Button variant="secondary" nativeButton={false} render={<Link href="/client/review" />}>
        Back to review queue
      </Button>
    </div>
  );
}
