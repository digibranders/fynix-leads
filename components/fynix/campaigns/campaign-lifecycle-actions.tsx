import { ArrowCounterClockwise, Lock, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { makeCampaignActiveAction, reopenCampaignAction } from "@/server/fynix/actions";
import { CloseCampaignForm } from "../forms/campaign-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

/** Makes a campaign being set up active. A refusal names what is missing: the side that has not accepted the agreement, or the host. */
export function MakeActiveButton({ campaignId }: { campaignId: string }) {
  return (
    <InlineAction action={makeCampaignActiveAction} fields={{ campaignId }} label="Make the campaign active" variant="secondary" size="sm">
      <PlayCircle aria-hidden />
      Make active
    </InlineAction>
  );
}

export function ReopenButton({ campaignId }: { campaignId: string }) {
  return (
    <InlineAction action={reopenCampaignAction} fields={{ campaignId }} label="Reopen the campaign" variant="secondary" size="sm">
      <ArrowCounterClockwise aria-hidden />
      Reopen
    </InlineAction>
  );
}

/** Opens the optional note, then closes the campaign. */
export function CloseCampaignButton({ campaignId, name }: { campaignId: string; name: string }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Lock aria-hidden />
          Close campaign
        </Button>
      }
      title="Close campaign"
      description="A closed campaign takes no new leads and is read only. You can reopen it."
    >
      <CloseCampaignForm campaignId={campaignId} name={name} />
    </FormSheet>
  );
}
