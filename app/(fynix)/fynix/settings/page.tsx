import type { Metadata } from "next";
import { FileText, Users } from "@phosphor-icons/react/dist/ssr";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { PageHeader } from "@/components/kit/page-header";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { PageSkeleton } from "@/components/kit/skeletons";
import { When } from "@/components/kit/when";
import { Badge } from "@/components/ui/badge";
import { getDomain } from "@/server/domain";
import { readSettings } from "@/server/domain/settings-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Settings" };

const PARTY_LABEL = { client: "Clients", agency: "Suppliers and agencies" } as const;

async function Settings() {
  const view = await requireFynix();
  const { team, terms } = await readSettings(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Who works at Fynix and which terms people accept." />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel aria-label="Fynix team">
          <PanelHeader title="Fynix team" count={team.length} />
          {team.length === 0 ? (
            <EmptyState icon={Users} title="No team members">
              People appear here once they accept an invite.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {team.map((person) => (
                <ListRow
                  key={person.email}
                  title={<Person name={person.name} sub={person.email} />}
                  trailing={
                    <span className="flex items-center gap-1.5">
                      <Badge variant="quiet" size="sm">{person.role === "manager" ? "Admin" : "Staff"}</Badge>
                      {person.status === "suspended" ? <Badge variant="red" size="sm">Suspended</Badge> : null}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel aria-label="Terms in force">
          <PanelHeader title="Terms in force" count={terms.length} />
          {terms.length === 0 ? (
            <EmptyState icon={FileText} title="No terms are published">
              Terms appear here once they are published for a party.
            </EmptyState>
          ) : (
            <ul className="flex flex-col pb-3">
              {terms.map((doc) => (
                <ListRow
                  key={doc.party}
                  title={PARTY_LABEL[doc.party]}
                  sub={
                    <>
                      {doc.title}, version {doc.version}, published <When at={doc.publishedAt} style="day" />
                    </>
                  }
                  trailing={doc.placeholder ? <Badge variant="amber" size="sm">Placeholder text</Badge> : null}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Settings />
    </Suspense>
  );
}
