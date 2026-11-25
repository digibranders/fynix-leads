import { Facts } from "@/components/kit/facts";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { countOf, formatDate } from "@/lib/fynix/format";
import type { CoordinatorDetail } from "@/server/domain/coordinator-overview";
import { ContactPanel } from "../records/contact-panel";

/** The Overview tab of a coordinator: the company facts at a glance, and the contact panel. People, agencies and campaigns have their own tabs. */
export function CoordinatorOverview({ coordinator, canWrite = false }: { coordinator: CoordinatorDetail; canWrite?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ["Name", coordinator.name],
          ["Time zone", coordinator.timeZone ?? "Not set"],
          ["Status", coordinator.status === "archived" ? "Archived" : "Active"],
          ["Coordinator since", formatDate(coordinator.createdAt, "UTC")],
          ["People", `${countOf(coordinator.everyone.filter((person) => person.kind === "member").length, "person", "people")} in ${countOf(coordinator.agencies.length + 1, "company", "companies")}`],
          ["Campaigns", campaignCountsText(coordinator.campaignCounts)],
        ]}
        className="sm:grid-cols-3"
      />
      <ContactPanel organisationId={coordinator.id} contact={coordinator.contact} canWrite={canWrite} mode="person" />
    </div>
  );
}
