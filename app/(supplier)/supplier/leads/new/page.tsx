import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { SubmitLeadForm } from "@/components/tenant/submit-lead-form";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getLeadSubmissionOptions } from "@/server/domain/leads";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Submit Lead" };

export default async function SupplierSubmitLeadPage() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const options = await getLeadSubmissionOptions(db, view.actor);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/supplier/leads"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1" })}
        >
          <ArrowLeft aria-hidden />
          <span>Back to Leads</span>
        </Link>
      </div>

      <TenantPageHeader
        title="Submit Qualified Lead"
        subtitle="Provide prospect details, validated BANT criteria and 1 to 3 proposed meeting times."
      />

      <SubmitLeadForm
        campaigns={options.campaigns}
        aliases={options.aliases}
        hosts={options.hosts}
      />
    </div>
  );
}
