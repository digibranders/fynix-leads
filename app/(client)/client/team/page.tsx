import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { TeamPanel } from "@/components/team/team-panel";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { listMyTeam } from "@/server/domain/team";

export const metadata: Metadata = { title: "Team" };

async function Team() {
  const view = await requireClient();
  const people = await listMyTeam(getDatabase("leads_client").db, getDomain(), view.actor);
  const own = { id: view.actor.orgId, name: people.find((row) => row.orgId === null)?.orgName ?? "Your company" };
  const members = people.filter((row) => row.kind === "member").length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Team"
        description={view.canWrite ? `${members} ${members === 1 ? "person" : "people"} at ${own.name}. Invite a colleague, and choose who gets meeting emails.` : `${members} ${members === 1 ? "person" : "people"} at ${own.name}. A manager invites colleagues.`}
      />
      <TeamPanel
        people={people}
        own={own}
        inviteInto={[own]}
        canWrite={view.canWrite}
        isClient
        inviteDescription={`They get an email with a link to set a password. They join ${own.name}.`}
        emptyHint={view.canWrite ? "Invite a colleague to start." : "A manager invites colleagues."}
      />
    </div>
  );
}

export default function ClientTeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}
