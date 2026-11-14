import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellSkeleton } from "@/components/fynix/skeletons";
import { TenantShell } from "@/components/tenant/app-shell";
import { CLIENT_NAV } from "@/components/tenant/nav-config";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = {
  title: { default: "Client Portal", template: "%s | Client Portal" },
  robots: { index: false, follow: false },
};

async function ClientShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireClient();
  return (
    <TenantShell
      userName={view.name}
      roleLabel={view.canWrite ? "Client manager" : "Client member"}
      portalLabel="Client"
      homeHref="/client"
      navItems={CLIENT_NAV}
    >
      {children}
    </TenantShell>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ClientShellLoader>{children}</ClientShellLoader>
    </Suspense>
  );
}
