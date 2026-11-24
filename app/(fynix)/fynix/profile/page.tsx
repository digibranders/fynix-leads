import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile() {
  const view = await requireFynix();
  return <ProfileScreen role="leads_fynix" orgId={null} userId={view.actor.userId} />;
}

export default function FynixProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}
