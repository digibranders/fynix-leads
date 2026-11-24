import { ArrowCounterClockwise, PencilSimple, Plus, Prohibit, Trash } from "@phosphor-icons/react/dist/ssr";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { Button } from "@/components/ui/button";
import { addBlockAction, addHostAction, pauseHostAction, removeBlockAction, setHoursAction } from "@/server/fynix/actions";
import { AddHostForm } from "../forms/campaign-forms";
import { BlockForm, HoursForm } from "../forms/availability-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

export function AddHostButton({ campaignId, candidates, clientName }: { campaignId: string; candidates: readonly { memberId: string; displayName: string }[]; clientName: string }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Add host
        </Button>
      }
      title="Add host"
      description={`A person at ${clientName} who takes meetings for this campaign.`}
    >
      <AddHostForm campaignId={campaignId} candidates={candidates} clientName={clientName} />
    </FormSheet>
  );
}

export function EditHoursButton({ memberId, hostName, timeZone, windows }: { memberId: string; hostName: string; timeZone: string; windows: readonly HoursWindow[] }) {
  return (
    <FormSheet
      trigger={
        <Button variant="ghost" size="xs">
          <PencilSimple aria-hidden />
          Edit
          <span className="sr-only"> weekly hours of {hostName}</span>
        </Button>
      }
      title="Weekly hours"
      description={`When ${hostName} takes meetings. Add a second range for a split day.`}
    >
      <HoursForm action={setHoursAction} memberId={memberId} timeZone={timeZone} windows={windows} />
    </FormSheet>
  );
}

export function BlockTimeButton({ memberId, hostName, timeZone }: { memberId: string; hostName: string; timeZone: string }) {
  return (
    <FormSheet
      trigger={
        <Button>
          <Plus aria-hidden />
          Block a time
        </Button>
      }
      title="Block a time"
      description={`A time ${hostName} cannot take meetings.`}
    >
      <BlockForm action={addBlockAction} memberId={memberId} timeZone={timeZone} />
    </FormSheet>
  );
}

export function RemoveBlockButton({ blockId, label }: { blockId: string; label: string }) {
  return (
    <InlineAction action={removeBlockAction} fields={{ blockId }} label={label} variant="ghost" size="sm">
      <Trash aria-hidden />
      Remove
    </InlineAction>
  );
}

/** Pauses a host who is taking meetings, or brings a paused one back with the same job title. */
export function HostPowerButton({ campaignId, memberId, jobTitle, active }: { campaignId: string; memberId: string; jobTitle: string; active: boolean }) {
  return active ? (
    <InlineAction action={pauseHostAction} fields={{ campaignId, memberId }} label="Pause host" size="default">
      <Prohibit aria-hidden />
      Pause host
    </InlineAction>
  ) : (
    <InlineAction action={addHostAction} fields={{ campaignId, memberId, jobTitle }} label="Reactivate host" size="default">
      <ArrowCounterClockwise aria-hidden />
      Reactivate host
    </InlineAction>
  );
}
