import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { requireCoordinator } from "@/server/coordinator/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile() {
  const view = await requireCoordinator();
  return <ProfileScreen role="leads_agency" orgId={view.actor.orgId} userId={view.actor.userId} />;
}

export default function CoordinatorProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}
