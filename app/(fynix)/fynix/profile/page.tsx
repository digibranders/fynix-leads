import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { fynixSecondFactorRequired } from "@/server/auth/second-factor";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Profile" };

async function Profile() {
  // This page is where a Fynix person without the second step is sent (REQUIRE_FYNIX_2FA), so it is the one page that lets them in.
  const view = await requireFynix({ allowWithoutSecondFactor: true });
  return <ProfileScreen role="leads_fynix" orgId={null} userId={view.actor.userId} secondFactor={{ enabled: view.twoFactorEnabled, required: fynixSecondFactorRequired() }} />;
}

export default function FynixProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}
