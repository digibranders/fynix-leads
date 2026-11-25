import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { TeamPanel } from "@/components/team/team-panel";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { listMyTeam } from "@/server/domain/team";
import { requireCoordinator } from "@/server/coordinator/session";

export const metadata: Metadata = { title: "Team" };

async function Team() {
  const view = await requireCoordinator();
  const db = getDatabase("leads_agency").db;
  const [people, partners] = await Promise.all([listMyTeam(db, getDomain(), view.actor), listPartnerAgencies(db, view.actor)]);
  const own = { id: view.actor.orgId, name: people.find((row) => row.orgId === null)?.orgName ?? "Your coordinator account" };
  const active = partners.filter((partner) => partner.status === "active").map((partner) => ({ id: partner.id, name: partner.name }));
  const members = people.filter((row) => row.kind === "member").length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Team"
        description={view.canWrite ? `${members} ${members === 1 ? "person" : "people"} across ${own.name} and ${partners.length} partner ${partners.length === 1 ? "agency" : "agencies"}. Invite into any of them.` : `${members} ${members === 1 ? "person" : "people"} across ${own.name} and its partner agencies. A manager invites colleagues.`}
      />
      <TeamPanel
        people={people}
        own={own}
        inviteInto={[own, ...active]}
        canWrite={view.canWrite}
        isClient={false}
        showOrganisation
        inviteDescription="They get an email with a link to set a password. Choose whether they join your coordinator account or one of your partner agencies."
        emptyHint={view.canWrite ? "Invite a person to start." : "A manager invites people."}
      />
    </div>
  );
}

export default function CoordinatorTeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}
