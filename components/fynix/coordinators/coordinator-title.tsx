import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import type { CoordinatorDetail } from "@/server/domain/coordinator-overview";
import { ArchiveToggle, EditOrganisationButton } from "../records/record-actions";
import { RecordTabs } from "../records/record-tabs";

/** The coordinator's name, reference and status, the admin's Edit and Archive, and the five sub-pages. */
export function CoordinatorTitle({ coordinator, canWrite }: { coordinator: CoordinatorDetail; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={coordinator.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge variant="quiet">Coordinator</Badge>
            {coordinator.status === "archived" ? <Badge variant="quiet">Archived</Badge> : null}
            <span className="font-mono text-caption">{coordinator.publicRef}</span>
          </span>
        }
        actions={
          canWrite ? (
            <>
              <EditOrganisationButton organisationId={coordinator.id} name={coordinator.name} timeZone={coordinator.timeZone} label="Coordinator" />
              <ArchiveToggle organisationId={coordinator.id} name={coordinator.name} status={coordinator.status} />
            </>
          ) : null
        }
      />
      <RecordTabs
        base={`/fynix/coordinators/${coordinator.publicRef}`}
        label="Coordinator sections"
        tabs={[
          { key: null, label: "Overview" },
          { key: "people", label: "People", count: coordinator.everyone.length },
          { key: "agencies", label: "Agencies", count: coordinator.agencies.length },
          { key: "campaigns", label: "Campaigns", count: coordinator.campaigns.length },
          { key: "activity", label: "Activity" },
        ]}
      />
    </div>
  );
}
