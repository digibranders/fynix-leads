import type { Metadata } from "next";
import { Handshake } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Agreement" };

export default async function ClientAgreementPage() {
  await requireClient();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Campaign Agreement" subtitle="Your virtual contract, targets, dispute window and attendance rules." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={Handshake} title="Agreement In Effect">
          Your meeting targets and rules are active. Any revised versions will require confirmation here.
        </EmptyState>
      </div>
    </div>
  );
}
