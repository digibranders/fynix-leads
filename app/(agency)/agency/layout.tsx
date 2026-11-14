import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellSkeleton } from "@/components/fynix/skeletons";
import { TenantShell } from "@/components/tenant/app-shell";
import { AGENCY_NAV } from "@/components/tenant/nav-config";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = {
  title: { default: "Agency Portal", template: "%s | Agency Portal" },
  robots: { index: false, follow: false },
};

async function AgencyShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireAgency();
  return (
    <TenantShell
      userName={view.name}
      roleLabel={view.canWrite ? "Agency manager" : "Agency member"}
      portalLabel="Partner Agency"
      homeHref="/agency"
      navItems={AGENCY_NAV}
    >
      {children}
    </TenantShell>
  );
}

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AgencyShellLoader>{children}</AgencyShellLoader>
    </Suspense>
  );
}
