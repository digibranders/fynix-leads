import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CampaignHeader } from "@/server/domain/campaign-overview";
import { EditCampaignForm } from "../forms/campaign-forms";
import { FormSheet } from "../forms/form-sheet";

/** The header button of the campaigns list: opens the New campaign page. Shown only to an admin. */
export function NewCampaignButton() {
  return (
    <Link href="/fynix/campaigns/new" className={buttonVariants()}>
      <Plus aria-hidden />
      New campaign
    </Link>
  );
}

/** Edits the campaign shown: its details, brief, settings and status. Shown only to an admin. */
export function EditCampaignButton({ campaign }: { campaign: CampaignHeader }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <PencilSimple aria-hidden />
          Edit campaign
        </Button>
      }
      title="Edit campaign"
      description="Change the details, the brief, the settings or the status. The client and the coordinator stay as they are."
    >
      <EditCampaignForm campaign={campaign} />
    </FormSheet>
  );
}
