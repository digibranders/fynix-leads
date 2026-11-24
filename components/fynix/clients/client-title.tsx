import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import { countOf } from "@/lib/fynix/format";
import type { ClientDetail } from "@/server/domain/client-overview";
import { ArchiveToggle, EditOrganisationButton } from "../records/record-actions";
import { RecordTabs } from "../records/record-tabs";

/** The client's name, reference and status, the admin's Edit and Archive, and the four sub-pages. */
export function ClientTitle({ client, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {client.status === "archived" ? <Badge variant="quiet">Archived</Badge> : null}
            <span className="font-mono text-caption">{client.publicRef}</span>
            <span>{countOf(client.people.length, "person", "people")}</span>
          </span>
        }
        actions={
          canWrite ? (
            <>
              <EditOrganisationButton organisationId={client.id} name={client.name} timeZone={client.timeZone} label="Client" />
              <ArchiveToggle organisationId={client.id} name={client.name} status={client.status} />
            </>
          ) : null
        }
      />
      <RecordTabs
        base={`/fynix/clients/${client.publicRef}`}
        label="Client sections"
        tabs={[
          { key: null, label: "Overview" },
          { key: "people", label: "People", count: client.people.length },
          { key: "campaigns", label: "Campaigns", count: client.campaigns.length },
          { key: "activity", label: "Activity" },
        ]}
      />
    </div>
  );
}
