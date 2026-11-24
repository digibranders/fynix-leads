import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = {
  title: { default: "Agency portal", template: "%s | Agency portal" },
  robots: { index: false, follow: false },
};

async function AgencyShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireAgency();
  return (
    <AppShell portal="agency" userName={view.name} roleLabel={view.canWrite ? "Agency manager" : "Agency member"}>
      {children}
    </AppShell>
  );
}

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AgencyShellLoader>{children}</AgencyShellLoader>
    </Suspense>
  );
}
