import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile() {
  const view = await requireClient();
  return <ProfileScreen role="leads_client" orgId={view.actor.orgId} userId={view.actor.userId} />;
}

export default function ClientProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}
