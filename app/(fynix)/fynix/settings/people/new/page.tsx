import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { FYNIX_ROLES, InvitePersonForm } from "@/components/fynix/forms/supplier-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { readSettings } from "@/server/domain/settings-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Invite person" };

async function Invite() {
  const view = await requireFynix();
  const { fynixOrg } = await readSettings(getDomain(), view.actor);
  if (!view.canWrite || fynixOrg === null) redirect("/fynix/settings");
  return (
    <FormPage
      title="Invite person"
      description="They get an email with a link to set a password. Fynix terms must be published first."
      backHref="/fynix/settings"
      backLabel="Settings"
    >
      <InvitePersonForm organisations={[fynixOrg]} roles={FYNIX_ROLES} showAlias={false} roleHelper="An admin changes set-up. Staff read it and work leads." page={{ cancelHref: "/fynix/settings" }} />
    </FormPage>
  );
}

export default function InviteFynixPersonPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Invite />
    </Suspense>
  );
}
