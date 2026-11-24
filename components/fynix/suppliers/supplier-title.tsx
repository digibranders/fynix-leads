import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import type { SupplierDetail } from "@/server/domain/supplier-overview";
import { ArchiveToggle, EditOrganisationButton } from "../records/record-actions";
import { RecordTabs } from "../records/record-tabs";

/** The coordinator's name, reference and status, the admin's Edit and Archive, and the five sub-pages. */
export function SupplierTitle({ supplier, canWrite }: { supplier: SupplierDetail; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={supplier.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge variant="quiet">Coordinator</Badge>
            {supplier.status === "archived" ? <Badge variant="quiet">Archived</Badge> : null}
            <span className="font-mono text-caption">{supplier.publicRef}</span>
          </span>
        }
        actions={
          canWrite ? (
            <>
              <EditOrganisationButton organisationId={supplier.id} name={supplier.name} timeZone={supplier.timeZone} label="Coordinator" />
              <ArchiveToggle organisationId={supplier.id} name={supplier.name} status={supplier.status} />
            </>
          ) : null
        }
      />
      <RecordTabs
        base={`/fynix/suppliers/${supplier.publicRef}`}
        label="Coordinator sections"
        tabs={[
          { key: null, label: "Overview" },
          { key: "people", label: "People", count: supplier.everyone.length },
          { key: "agencies", label: "Agencies", count: supplier.agencies.length },
          { key: "campaigns", label: "Campaigns", count: supplier.campaigns.length },
          { key: "activity", label: "Activity" },
        ]}
      />
    </div>
  );
}
