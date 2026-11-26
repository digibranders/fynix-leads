import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { Button } from "@/components/ui/button";
import { addBlockAction, removeBlockAction, setHoursAction } from "@/server/fynix/actions";
import { BlockForm, HoursForm } from "../forms/availability-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

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
