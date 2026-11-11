import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { StatusBadge } from "@/components/status/status-badge";
import { TimeInZones } from "@/components/time/time-in-zones";
import type { Lead } from "@/lib/domain/types";

type Props = {
  lead: Lead;
  viewerZone: string;
  now: Date;
};

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** Meeting, prospect and qualification blocks, shared by the review queue pane and the lead record. */
export function LeadDetails({ lead, viewerZone }: Props) {
  const { prospect, bant } = lead;
  const meeting = lead.meetings[0];
  const meetingStart = meeting ? new Date(meeting.startsAt) : null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="meeting-heading" className="flex flex-col gap-3 border-t pt-5">
        <h3 id="meeting-heading" className="text-sm font-medium">
          Meeting
        </h3>
        {meeting && meetingStart ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 xl:grid-cols-[auto_auto_auto] xl:justify-start">
            <Field label="When" className="col-span-2 xl:col-span-1">
              <TimeInZones
                at={meetingStart}
                viewerZone={viewerZone}
                other={prospect.zone === viewerZone ? undefined : { zone: prospect.zone, label: "the prospect" }}
              />
            </Field>
            <Field label="Status">
              <StatusBadge kind="meeting" status={meeting.status} />
            </Field>
            <Field label="With">
              {meeting.repName}, {meeting.durationMinutes} minutes
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No meeting is booked for this lead.</p>
        )}
      </section>

      <section aria-labelledby="prospect-heading" className="flex flex-col gap-3 border-t pt-5">
        <h3 id="prospect-heading" className="text-sm font-medium">
          Prospect
        </h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 xl:grid-cols-[auto_auto_auto] xl:justify-start">
          <Field label="Email" className="col-span-2 xl:col-span-1">
            {prospect.email}
          </Field>
          <Field label="Phone">{prospect.phone}</Field>
          <Field label="LinkedIn">
            <a
              href={prospect.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-primary underline underline-offset-4 outline-none hover:text-navy-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              View profile
              <ArrowSquareOut aria-hidden size={14} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Field>
        </dl>
      </section>

      <section aria-labelledby="qualification-heading" className="flex flex-col gap-3 border-t pt-5">
        <h3 id="qualification-heading" className="text-sm font-medium">
          Qualification
        </h3>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Budget">{bant.budget}</Field>
          <Field label="Authority">{bant.authority}</Field>
          <Field label="Need">{bant.need}</Field>
          <Field label="Timeline">{bant.timeline}</Field>
        </dl>
      </section>
    </div>
  );
}
