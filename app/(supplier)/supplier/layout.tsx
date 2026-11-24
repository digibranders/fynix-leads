import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = {
  title: { default: "Supplier portal", template: "%s | Supplier portal" },
  robots: { index: false, follow: false },
};

async function SupplierShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireSupplier();
  return (
    <AppShell portal="supplier" userName={view.name} roleLabel={view.canWrite ? "Supplier manager" : "Supplier member"}>
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
