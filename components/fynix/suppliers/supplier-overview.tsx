import { Facts } from "@/components/kit/facts";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { countOf, formatDate } from "@/lib/fynix/format";
import type { SupplierDetail } from "@/server/domain/supplier-overview";

/** The Overview tab of a coordinator: the company facts at a glance. People, agencies and campaigns have their own tabs. */
export function SupplierOverview({ supplier }: { supplier: SupplierDetail }) {
  return (
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
  );
}
