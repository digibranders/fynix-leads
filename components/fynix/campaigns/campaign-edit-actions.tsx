import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import type { CampaignChoices, CampaignHeader } from "@/server/domain/campaign-overview";
import { CreateCampaignForm, EditCampaignForm } from "../forms/campaign-forms";
import { FormSheet } from "../forms/form-sheet";

/** The header button of the campaigns list. Shown only to an admin. */
export function NewCampaignButton({ choices }: { choices: CampaignChoices }) {
  return (
    <FormSheet
      trigger={
        <Button>
          <Plus aria-hidden />
          New campaign
        </Button>
      }
      title="New campaign"
      description="Choose the client and the coordinator, then set the dates, targets and brief. It starts as a draft."
    >
      <CreateCampaignForm choices={choices} />
    </FormSheet>
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
