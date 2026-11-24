import type { Metadata } from "next";
import { FileText } from "@phosphor-icons/react/dist/ssr";
import { Suspense } from "react";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list";
import { PageHeader } from "@/components/kit/page-header";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { When } from "@/components/kit/when";
import { Badge } from "@/components/ui/badge";
import { GroupsToReview } from "@/components/fynix/settings/groups-to-review";
import { PublishTermsButton } from "@/components/fynix/settings/settings-actions";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { listMixedGroups } from "@/server/domain/groups";
import { readSettings } from "@/server/domain/settings-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Settings" };

const PARTY_LABEL = { client: "Clients", agency: "Coordinators and agencies", fynix: "Fynix team" } as const;

async function Settings() {
  const view = await requireFynix();
  const { fynixOrg, team, terms } = await readSettings(getDomain(), view.actor);
  // Admin only, though the read itself is open to staff: repairing a group is set-up work.
  const mixedGroups = view.canWrite ? await listMixedGroups(getDatabase("leads_fynix").db, view.actor) : null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Who works at Fynix and which terms people accept." />

      <PeopleTable
        title="Fynix team"
        people={team}
        canWrite={view.canWrite}
        selfUserId={view.actor.userId}
        emptyHint="Invite a colleague to start."
        action={view.canWrite && fynixOrg !== null ? <InvitePersonButton kind="fynix" organisations={[fynixOrg]} description="They get an email with a link to set a password. Fynix terms must be published first." /> : null}
      />

      <div className="grid items-start gap-4">
        <Panel aria-label="Terms in force">
          <PanelHeader title="Terms in force" count={terms.length} action={view.canWrite ? <PublishTermsButton /> : null} />
          {terms.length === 0 ? (
            <EmptyState icon={FileText} title="No terms are published">
              Publish terms for each side before you invite its people.
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
        {mixedGroups === null ? null : <GroupsToReview groups={mixedGroups} />}
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
