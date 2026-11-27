import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CalendarConnectionsSection } from "@/components/calendar/connections-section";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile({ searchParams }: { searchParams: PageProps<"/agency/profile">["searchParams"] }) {
  const view = await requireAgency();
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <ProfileScreen role="leads_agency" orgId={view.actor.orgId} userId={view.actor.userId} />
      <CalendarConnectionsSection who={{ userId: view.actor.userId, kind: "agency", orgId: view.actor.orgId }} outcome={typeof params.calendar === "string" ? params.calendar : undefined} />
    </div>
  );
}

export default function AgencyProfilePage({ searchParams }: PageProps<"/agency/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}
