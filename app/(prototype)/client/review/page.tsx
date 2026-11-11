import type { Metadata } from "next";
import { ReviewQueue } from "@/components/review/review-queue";
import { ReviewSubtitle } from "@/components/review/review-subtitle";
import { PageHeader } from "@/components/shell/page-header";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewQueuePage() {
  return (
    // From lg the header and the two panels fill the viewport under the shell padding (20 top, 24 bottom), and the panes scroll inside.
    <div className="lg:flex lg:h-[calc(100dvh-44px)] lg:min-h-[640px] lg:flex-col">
      <PageHeader title="Review queue" subtitle={<ReviewSubtitle />} />
      <ReviewQueue leads={SAMPLE_LEADS} now={SAMPLE_NOW.toISOString()} viewerZone={VIEWER_ZONES.client} />
    </div>
  );
}
