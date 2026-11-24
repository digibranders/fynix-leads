"use client";

import { CheckCircle, Clock, X } from "@phosphor-icons/react";
import { useState } from "react";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { useViewerZone, When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { formatDayInZone, formatTimeInZone, zoneAbbreviation } from "@/lib/time/zones";
import { cn } from "@/lib/utils";
import { PickTimeForm, ProposeTimesForm, RejectLeadForm } from "./lead-forms";

/** One proposed time as a card: the day, the clock time large, the zone, and the same moment in the host's zone. A real radio underneath, so the keyboard and screen readers get a radio group. */
function Slot({ iso, index, checked, hostZone, onSelect }: { iso: string; index: number; checked: boolean; hostZone: string | null; onSelect: () => void }) {
  const zone = useViewerZone();
  const at = new Date(iso);
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-0.5 rounded-md px-4 py-3.5 transition-[background-color,box-shadow,color] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy",
        checked ? "bg-navy text-offwhite shadow-slot" : "bg-tonal hover:bg-navy-08",
      )}
    >
      <input type="radio" name="selectedMeetingTime" value={iso} checked={checked} onChange={onSelect} required={index === 0} className="sr-only" />
      <span suppressHydrationWarning className={cn("text-label font-semibold", checked ? "text-on-navy-text" : "text-ink-muted")}>
        {formatDayInZone(at, zone)}
      </span>
      <span suppressHydrationWarning className="text-[24px] leading-[30px] font-semibold tracking-figure">
        {formatTimeInZone(at, zone)}
      </span>
      <span suppressHydrationWarning className={cn("text-caption", checked ? "text-on-navy-muted" : "text-ink-muted")}>
        {zoneAbbreviation(at, zone)}
      </span>
      {hostZone !== null && hostZone !== zone ? (
        <span suppressHydrationWarning className={cn("text-caption", checked ? "text-on-navy-muted" : "text-ink-muted")}>
          {formatTimeInZone(at, hostZone)} {zoneAbbreviation(at, hostZone)} for the host
        </span>
      ) : null}
      {checked ? <CheckCircle aria-hidden weight="fill" size={18} className="absolute top-3 right-3 text-peach" /> : null}
    </label>
  );
}

/**
 * The first answer on one lead: pick one of the proposed times, ask for other times, or reject with a note. Picking a time only books the meeting,
 * so it opens a sheet that says so before it saves; the client accepts or rejects the lead after the meeting.
 */
export function ReviewPanel({ leadId, prospectName, times, hostZone }: { leadId: string; prospectName: string; times: readonly string[]; hostZone: string | null }) {
  const [selected, setSelected] = useState(times[0] ?? "");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-2.5 px-6 pb-6">
        <h3 id={`times-${leadId}`} className="text-body font-semibold">
          Choose a meeting time
        </h3>
        {times.length === 0 ? (
          <p className="text-body text-ink-muted">No times are offered for this lead. Propose other times or reject it.</p>
        ) : (
          <div role="radiogroup" aria-labelledby={`times-${leadId}`} className="grid gap-2.5 sm:grid-cols-3">
            {times.map((iso, index) => (
              <Slot key={iso} iso={iso} index={index} checked={selected === iso} hostZone={hostZone} onSelect={() => setSelected(iso)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3 bg-navy-03 px-6 py-4">
        <FormSheet
          trigger={
            <Button type="button" variant="ghost-destructive">
              <X aria-hidden weight="bold" />
              Reject lead
            </Button>
          }
          title="Reject this lead"
          description={`Reject ${prospectName} before the meeting.`}
        >
          <RejectLeadForm leadId={leadId} booked={false} />
        </FormSheet>
        <FormSheet
          trigger={
            <Button type="button" variant="secondary">
              <Clock aria-hidden weight="bold" />
              Propose other times
            </Button>
          }
          title="Propose other times"
          description={`Offer one to three times for ${prospectName}.`}
        >
          <ProposeTimesForm leadId={leadId} />
        </FormSheet>
        <span className="flex-1" />
        {selected ? (
          <span className="text-body text-ink-muted max-sm:hidden">
            <When at={selected} />
          </span>
        ) : null}
        <FormSheet
          trigger={
            <Button type="button" size="lg" disabled={times.length === 0 || selected === ""}>
              Accept this time
            </Button>
          }
          title="Book this meeting"
          description={`Confirm the time for ${prospectName}.`}
        >
          <PickTimeForm leadId={leadId} time={selected} />
        </FormSheet>
      </div>
    </div>
  );
}
