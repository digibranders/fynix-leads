import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import type { AgencyDetail } from "@/server/domain/agency-overview";
import { ArchiveToggle, EditOrganisationButton } from "../records/record-actions";
import { RecordTabs } from "../records/record-tabs";

/** The agency's name, reference and status, the admin's Edit and Archive, and the five sub-pages. */
export function AgencyTitle({ agency, canWrite }: { agency: AgencyDetail; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={agency.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge variant="quiet">Agency</Badge>
            {agency.status === "archived" ? <Badge variant="quiet">Archived</Badge> : null}
            <span className="font-mono text-caption">{agency.publicRef}</span>
          </span>
        }
        actions={
          canWrite ? (
            <>
              <EditOrganisationButton organisationId={agency.id} name={agency.name} timeZone={agency.timeZone} label="Agency" />
              <ArchiveToggle organisationId={agency.id} name={agency.name} status={agency.status} />
            </>
          ) : null
        }
      />
      <RecordTabs
        base={`/fynix/agencies/${agency.publicRef}`}
        label="Agency sections"
        tabs={[
          { key: null, label: "Overview" },
          { key: "people", label: "People", count: agency.people.length },
          { key: "campaigns", label: "Campaigns", count: agency.campaigns.length },
          { key: "leads", label: "Leads" },
          { key: "activity", label: "Activity" },
        ]}
      />
    </div>
  );
}
