import type { Metadata } from "next";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Hosts & Availability" };

export default async function ClientHostsPage() {
  await requireClient();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Meeting Hosts & Availability" subtitle="Manage which team members take meetings and configure their available hours." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={UsersThree} title="Host schedules active">
          Team working hours and blocked times are synced with campaign bookings.
        </EmptyState>
      </div>
    </div>
  );
}
