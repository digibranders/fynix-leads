import { ReviewQueue } from "@/components/review/review-queue";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";

export default function ReviewQueuePage() {
  return <ReviewQueue leads={SAMPLE_LEADS} now={SAMPLE_NOW.toISOString()} viewerZone={VIEWER_ZONES.client} />;
}
