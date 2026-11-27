import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CalendarConnectionsSection } from "@/components/calendar/connections-section";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { fynixSecondFactorRequired } from "@/server/auth/second-factor";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile({ searchParams }: { searchParams: PageProps<"/fynix/profile">["searchParams"] }) {
  // This page is where a Fynix person without the second step is sent (REQUIRE_FYNIX_2FA), so it is the one page that lets them in.
  const view = await requireFynix({ allowWithoutSecondFactor: true });
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <ProfileScreen role="leads_fynix" orgId={null} userId={view.actor.userId} secondFactor={{ enabled: view.twoFactorEnabled, required: fynixSecondFactorRequired() }} />
      <CalendarConnectionsSection who={{ userId: view.actor.userId, kind: "fynix", orgId: null }} outcome={typeof params.calendar === "string" ? params.calendar : undefined} />
    </div>
  );
}

export default function FynixProfilePage({ searchParams }: PageProps<"/fynix/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}
