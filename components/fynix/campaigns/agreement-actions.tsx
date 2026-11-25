import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { removeShareAction } from "@/server/fynix/actions";
import { FormSheet } from "../forms/form-sheet";
import { ConfirmAction } from "../forms/confirm-action";
import { NewAgreementForm, ShareForm } from "../forms/campaign-forms";

type Defaults = { monthlyTarget: number; totalTarget: number; rules: string; notes: string };

/** `first` is the first version of an agreement: it starts from the campaign's numbers and the standard rules rather than from a version in force. */
export function NewVersionButton({ campaignId, defaults, first = false }: { campaignId: string; defaults: Defaults | null; first?: boolean }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm" className="shrink-0">
          <PencilSimple aria-hidden />
          {first ? "First version" : "New version"}
        </Button>
      }
      title={first ? "First agreement" : "New agreement version"}
      description={first ? "The numbers start from the campaign and the rules from the standard ones. Change what this campaign needs." : "It replaces the current version. The current one stays in the history."}
    >
      <NewAgreementForm campaignId={campaignId} defaults={defaults} />
    </FormSheet>
  );
}

export function AddShareButton({ campaignId, options, suggested }: { campaignId: string; options: readonly { id: string; name: string }[]; suggested?: number }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Add share
        </Button>
      }
      title="Add share"
      description="How many meetings a month an agency takes on for this campaign. It starts from what is left of the campaign's monthly number."
    >
      <ShareForm campaignId={campaignId} options={options} {...(suggested === undefined ? {} : { suggested })} />
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
