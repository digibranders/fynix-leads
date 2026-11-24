import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { getDatabase } from "@/server/db/client";
import { loadShellCounts } from "@/server/domain/notices";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = {
  title: { default: "Coordinator portal", template: "%s | Coordinator portal" },
  robots: { index: false, follow: false },
};

async function SupplierShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireSupplier();
  const shell = await loadShellCounts(getDatabase("leads_agency").db, view.actor);
  return (
    <AppShell portal="supplier" userName={view.name} roleLabel={view.canWrite ? "Coordinator manager" : "Coordinator member"} counts={{ messages: shell.messages }} unreadNotices={shell.notices}>
      {children}
    </AppShell>
  );
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SupplierShellLoader>{children}</SupplierShellLoader>
    </Suspense>
  );
}
