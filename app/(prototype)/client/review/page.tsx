import { ReviewQueue } from "@/components/review/review-queue";
import { PageHeader } from "@/components/shell/page-header";
import { reviewQueue } from "@/lib/review/queue";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";

export default function ReviewQueuePage() {
  const waiting = reviewQueue(SAMPLE_LEADS).length;
  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle={`${waiting} ${waiting === 1 ? "lead" : "leads"} waiting on your decision, oldest first`}
      />
      <ReviewQueue leads={SAMPLE_LEADS} now={SAMPLE_NOW.toISOString()} viewerZone={VIEWER_ZONES.client} />
    </>
  );
}
