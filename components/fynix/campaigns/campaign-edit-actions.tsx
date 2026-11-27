import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { CampaignHeader } from "@/server/domain/campaign-overview";

/** The header button of the campaigns list: opens the New campaign page. Shown only to an admin. */
export function NewCampaignButton() {
  return (
    <Link href="/fynix/campaigns/new" className={buttonVariants()}>
      <Plus aria-hidden />
      New campaign
    </Link>
  );
}

/** Opens the Edit campaign page: the same tabs as New campaign, filled with what is stored. Shown only to an admin. */
export function EditCampaignButton({ campaign }: { campaign: CampaignHeader }) {
  return (
    <Link href={`/fynix/campaigns/${campaign.publicRef}/edit`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
      <PencilSimple aria-hidden />
      Edit campaign
    </Link>
  );
}
