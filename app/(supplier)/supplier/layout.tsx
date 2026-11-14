import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellSkeleton } from "@/components/fynix/skeletons";
import { TenantShell } from "@/components/tenant/app-shell";
import { SUPPLIER_NAV } from "@/components/tenant/nav-config";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = {
  title: { default: "Supplier Portal", template: "%s | Supplier Portal" },
  robots: { index: false, follow: false },
};

async function SupplierShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireSupplier();
  return (
    <TenantShell
      userName={view.name}
      roleLabel={view.canWrite ? "Supplier manager" : "Supplier member"}
      portalLabel="Supplier"
      homeHref="/supplier"
      navItems={SUPPLIER_NAV}
    >
      {children}
    </TenantShell>
  );
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SupplierShellLoader>{children}</SupplierShellLoader>
    </Suspense>
  );
}
