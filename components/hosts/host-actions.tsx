import { Plus, Prohibit, Trash, UserPlus, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/fynix/forms/confirm-action";
import { BlockForm, HoursForm } from "@/components/fynix/forms/availability-forms";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { InlineAction } from "@/components/fynix/forms/inline-action";
import { Button } from "@/components/ui/button";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { addOwnBlockAction, pauseClientHostAction, removeOwnBlockAction, setOwnHoursAction } from "@/server/domain/team-actions";
import { AddHostForm } from "./host-forms";

/** A client manager adds a host. */
export function AddHostButton({ campaigns, people }: { campaigns: readonly { id: string; name: string }[]; people: readonly { memberId: string; name: string }[] }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <UserPlus aria-hidden />
          Add host
        </Button>
      }
      title="Add host"
      description="A person at your organisation who takes meetings for a campaign."
    >
      <AddHostForm campaigns={campaigns} people={people} />
    </FormSheet>
  );
}

/** A client manager pauses a host on one campaign, after confirming. */
export function PauseHostButton({ campaignId, memberId, hostName, campaignName }: { campaignId: string; memberId: string; hostName: string; campaignName: string }) {
  return (
    <ConfirmAction
      action={pauseClientHostAction}
      fields={{ campaignId, memberId }}
      triggerLabel={`Pause ${hostName} on ${campaignName}`}
      trigger={
        <>
          <Prohibit aria-hidden />
          Pause on {campaignName}
        </>
      }
      title={`Pause ${hostName} on ${campaignName}?`}
      description={`${hostName} is no longer offered for meetings on this campaign. Meetings already booked stay. You can add them again later.`}
      confirmLabel="Pause host"
      savedMessage="Host paused"
    />
  );
}

/** A person edits their own weekly hours. */
export function EditOwnHoursButton({ timeZone, windows }: { timeZone: string; windows: readonly HoursWindow[] }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <PencilSimple aria-hidden />
          Edit my hours
        </Button>
      }
      title="My weekly hours"
      description="When you take meetings. Add a second range for a split day."
    >
      <HoursForm action={setOwnHoursAction} timeZone={timeZone} windows={windows} />
    </FormSheet>
  );
}

/** A person blocks a time for themselves. */
export function BlockOwnTimeButton({ timeZone }: { timeZone: string }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Block a time
        </Button>
      }
      title="Block a time"
      description="A time you cannot take meetings."
    >
      <BlockForm action={addOwnBlockAction} timeZone={timeZone} />
    </FormSheet>
  );
}

export function RemoveOwnBlockButton({ blockId, label }: { blockId: string; label: string }) {
  return (
    <InlineAction action={removeOwnBlockAction} fields={{ blockId }} label={label} variant="ghost" size="sm">
      <Trash aria-hidden />
      Remove
    </InlineAction>
  );
}
