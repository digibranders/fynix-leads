import type { Metadata } from "next";
import { Suspense } from "react";
import { FynixShell } from "@/components/fynix/app-shell";
import { ShellSkeleton } from "@/components/fynix/skeletons";

export const metadata: Metadata = { title: { default: "Fynix", template: "%s | Fynix Leads" }, robots: { index: false, follow: false } };

/**
 * The layout holds nothing private. The shell reads the session, so it sits in its own `<Suspense>` boundary: a client navigation
 * does not run a layout again, which is why every page asks for the session too.
 */
export default function FynixLayout({ children }: LayoutProps<"/fynix">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <FynixShell>{children}</FynixShell>
    </Suspense>
  );
}
