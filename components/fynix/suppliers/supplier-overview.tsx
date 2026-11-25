import { Facts } from "@/components/kit/facts";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { countOf, formatDate } from "@/lib/fynix/format";
import type { SupplierDetail } from "@/server/domain/supplier-overview";
import { ContactPanel } from "../records/contact-panel";

/** The Overview tab of a coordinator: the company facts at a glance, and the contact panel. People, agencies and campaigns have their own tabs. */
export function SupplierOverview({ supplier, canWrite = false }: { supplier: SupplierDetail; canWrite?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ["Company name", supplier.name],
          ["Time zone", supplier.timeZone ?? "Not set"],
          ["Status", supplier.status === "archived" ? "Archived" : "Active"],
          ["Coordinator since", formatDate(supplier.createdAt, "UTC")],
          ["People", `${countOf(supplier.everyone.filter((person) => person.kind === "member").length, "person", "people")} in ${countOf(supplier.agencies.length + 1, "company", "companies")}`],
          ["Campaigns", campaignCountsText(supplier.campaignCounts)],
        ]}
        className="sm:grid-cols-3"
      />
      <ContactPanel organisationId={supplier.id} contact={supplier.contact} canWrite={canWrite} />
    </div>
  );
}
