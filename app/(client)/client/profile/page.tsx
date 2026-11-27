import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CalendarConnectionsSection } from "@/components/calendar/connections-section";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile({ searchParams }: { searchParams: PageProps<"/client/profile">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <ProfileScreen role="leads_client" orgId={view.actor.orgId} userId={view.actor.userId} />
      <CalendarConnectionsSection who={{ userId: view.actor.userId, kind: "client", orgId: view.actor.orgId }} outcome={typeof params.calendar === "string" ? params.calendar : undefined} />
    </div>
  );
}

export default function ClientProfilePage({ searchParams }: PageProps<"/client/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}
