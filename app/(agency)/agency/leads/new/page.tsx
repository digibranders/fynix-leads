import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { SubmitLeadForm } from "@/components/leads/submit-lead-form";
import { getDatabase } from "@/server/db/client";
import { getLeadSubmissionOptions } from "@/server/domain/leads";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Submit a lead" };

async function SubmitLead() {
  const view = await requireAgency();
  const options = await getLeadSubmissionOptions(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Submit a lead" description="Prospect details, the qualification answers, and one to three proposed meeting times." />
      <SubmitLeadForm campaigns={options.campaigns} aliases={options.aliases} hosts={options.hosts} leadsHref="/agency/leads" />
    </div>
  );
}

export default function AgencySubmitLeadPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubmitLead />
    </Suspense>
  );
}
