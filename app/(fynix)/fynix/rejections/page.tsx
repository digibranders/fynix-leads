import type { Metadata } from "next";
import { Suspense } from "react";
import { ContestsTable } from "@/components/fynix/rejections/contests-table";
import { RejectionsTable } from "@/components/fynix/rejections/rejections-table";
import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { TabNav } from "@/components/kit/tab-nav";
import { getDomain } from "@/server/domain";
import { listContests } from "@/server/domain/contests";
import { listRejections } from "@/server/domain/rejection-overview";
import { listRejectionReviews } from "@/server/domain/rejection-reviews";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Rejections and contests" };

const BASE = "/fynix/rejections";
const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Rejections({ searchParams }: { searchParams: PageProps<"/fynix/rejections">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const deps = getDomain();
  const [all, reviews, contests] = await Promise.all([listRejections(deps, view.actor), listRejectionReviews(deps, view.actor), listContests(deps, view.actor)]);
  const tab = one(params.tab) === "contests" ? "contests" : "rejections";
  const reviewsByLead = Object.fromEntries(reviews.map((review) => [review.leadId, review]));
  const requested = all.filter((row) => reviewsByLead[row.leadId] !== undefined);
  const onlyRequested = tab === "rejections" && one(params.show) === "review";
  const rows = onlyRequested ? requested : all;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rejections and contests"
        description="Leads a client rejected after the meeting, and outcomes one side contested. Fynix reads the notes and decides."
      />
      <Panel aria-label="Queue">
        <TabNav
          label="Queue"
          items={[
            { label: "Rejections", href: BASE, count: all.length, active: tab === "rejections" && !onlyRequested },
            { label: "Review requested", href: `${BASE}?show=review`, count: requested.length, active: onlyRequested },
            { label: "Contests", href: `${BASE}?tab=contests`, count: contests.length, active: tab === "contests" },
          ]}
        />
      </Panel>
      {tab === "contests" ? (
        <ContestsTable rows={contests} now={new Date()} />
      ) : (
        <RejectionsTable rows={rows} now={new Date()} reviews={reviewsByLead} emptyText={onlyRequested ? "No coordinator has asked for a review of a rejection that is still open." : undefined} />
      )}
    </div>
  );
}

export default function RejectionsPage({ searchParams }: PageProps<"/fynix/rejections">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Rejections searchParams={searchParams} />
    </Suspense>
  );
}
