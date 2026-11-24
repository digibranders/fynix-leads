import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { removeShareAction } from "@/server/fynix/actions";
import { FormSheet } from "../forms/form-sheet";
import { ConfirmAction } from "../forms/confirm-action";
import { NewAgreementForm, ShareForm } from "../forms/campaign-forms";

type Defaults = { monthlyTarget: number; totalTarget: number; disputeWindowHours: number; rules: string; notes: string };

export function NewVersionButton({ campaignId, defaults }: { campaignId: string; defaults: Defaults | null }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm" className="shrink-0">
          <PencilSimple aria-hidden />
          {defaults === null ? "First version" : "New version"}
        </Button>
      }
      title={defaults === null ? "First agreement" : "New agreement version"}
      description={defaults === null ? "Set the numbers and the counting rules." : "It replaces the current version. The current one stays in the history."}
    >
      <NewAgreementForm campaignId={campaignId} defaults={defaults} />
    </FormSheet>
  );
}

export function AddShareButton({ campaignId, options }: { campaignId: string; options: readonly { id: string; name: string }[] }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Add share
        </Button>
      }
      title="Add share"
      description="How many meetings a month an agency takes on for this campaign."
    >
      <ShareForm campaignId={campaignId} options={options} />
    </FormSheet>
  );
}

export function ShareRowActions({ campaignId, agency }: { campaignId: string; agency: { id: string; name: string; monthlyShare: number } }) {
  return (
    <div className="flex items-start justify-end gap-1">
      <FormSheet
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Edit the share of ${agency.name}`}>
            <PencilSimple aria-hidden />
            Edit
          </Button>
        }
        title="Edit share"
        description="The agency's meetings per month for this campaign."
      >
        <ShareForm campaignId={campaignId} options={[]} agency={agency} />
      </FormSheet>
      <ConfirmAction
        action={removeShareAction}
        fields={{ campaignId, agencyOrgId: agency.id }}
        triggerLabel={`Remove the share of ${agency.name}`}
        trigger={
          <>
            <Trash aria-hidden />
            Remove
          </>
        }
        title={`Remove the share of ${agency.name}?`}
        description={`${agency.name} stops receiving leads for this campaign, and its share of ${agency.monthlyShare} a month is deleted. The change is recorded in the audit log.`}
        confirmLabel="Remove share"
        savedMessage="Share removed"
      />
    </div>
  );
}
