import Link from "next/link";
import { Facts } from "@/components/kit/facts";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { countOf, formatDate } from "@/lib/fynix/format";
import type { AgencyDetail } from "@/server/domain/agency-overview";
import { ContactPanel } from "../records/contact-panel";

/** The Overview tab of an agency: the company facts, its coordinator, a summary of its shares and this month's leads, and the contact panel. */
export function AgencyOverview({ agency, canWrite }: { agency: AgencyDetail; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ["Company name", agency.name],
          [
            "Coordinator",
            <Link key="coordinator" href={`/fynix/suppliers/${agency.coordinator.publicRef}`} className="rounded-xs hover:underline">
              {agency.coordinator.name}
            </Link>,
          ],
          ["Status", agency.status === "archived" ? "Archived" : "Active"],
          ["Time zone", agency.timeZone ?? "Not set"],
          ["Agency since", formatDate(agency.createdAt, "UTC")],
          ["People", countOf(agency.people.filter((person) => person.kind === "member").length, "person", "people")],
          ["Campaigns", campaignCountsText(agency.campaignCounts)],
          ["Shares", agency.shares.campaigns === 0 ? "No shares yet" : `${agency.shares.monthlyTotal} a month across ${countOf(agency.shares.campaigns, "campaign", "campaigns")}`],
          ["This month", `${agency.tally.submittedThisMonth} sent, ${agency.tally.acceptedThisMonth} accepted`],
        ]}
        className="sm:grid-cols-3"
      />
      <ContactPanel organisationId={agency.id} contact={agency.contact} canWrite={canWrite} />
    </div>
  );
}
