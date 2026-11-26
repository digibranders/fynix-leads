import Link from "next/link";
import { ArrowLeft, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { ClosedTag } from "@/components/kit/closed-tag";
import { Facts, Quote } from "@/components/kit/facts";
import { PageHeader } from "@/components/kit/page-header";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/fynix/forms/confirm-action";
import { When } from "@/components/kit/when";
import { LeadMessagesButton } from "@/components/messaging/lead-messages-button";
import { DownloadIcsButton, JoinMeetButton } from "@/components/meetings/meeting-actions";
import { buttonVariants } from "@/components/ui/button";
import { isClosed } from "@/lib/campaign-status";
import { autoAcceptCountdown } from "@/lib/leads/decision-queue";
import { decisionNoteLabel, historyActionText, historySideText, stageChangeText } from "@/lib/leads/history-text";
import type { LeadViewer } from "@/lib/leads/lead-actions";
import type { LeadStage } from "@/lib/leads/stage";
import { formatInZone } from "@/lib/time/zones";
import type { LeadRecord, RescheduleView } from "@/server/domain/lead-record";
import { discardDraftAction } from "@/server/domain/draft-actions";
import { showsJoinBlock } from "@/lib/leads/who-joined";
import type { MeetingJoinRecord } from "@/server/domain/meeting-joins";
import { LeadActionBar } from "./lead-action-bar";
import { recordFacts } from "./record-facts";
import { WhoJoined } from "./who-joined";

const safeLink = (url: string): React.ReactNode =>
  /^https:\/\//i.test(url) ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
      {url}
    </a>
  ) : (
    url
  );

/** A time in the viewer's own zone and, when the host's zone is known, in the host's too. */
function Times({ at, hostZone }: { at: Date | string; hostZone: string | null }) {
  const date = new Date(at);
  return (
    <span className="flex flex-col">
      <When at={date} />
      {hostZone === null ? null : <span className="text-caption font-normal text-ink-muted">{formatInZone(date, hostZone)} for the host</span>}
    </span>
  );
}

/** Who contested, as the viewer may read it: the client and Fynix are named, the supply side is one side. */
function contesterText(role: string | null, viewer: LeadViewer): string {
  if (role === "client") return viewer === "client" ? "your team" : "the client";
  return viewer === "client" ? "the Fynix team" : viewer === "supply" ? "your side" : role === "coordinator" ? "the coordinator" : "the agency";
}

/** A proposal to move the meeting that waits for an answer: "New times proposed" for the side that must pick, a waiting line for the side that proposed. */
function ProposalNotice({ proposal, viewer, hostZone }: { proposal: RescheduleView; viewer: LeadViewer; hostZone: string | null }) {
  const mine = viewer === (proposal.proposedBySide === "client" ? "client" : "supply");
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-amber-soft px-3.5 py-3 text-amber-text">
      <p className="text-row font-semibold">{mine ? "You proposed new times" : viewer === "fynix" ? `New times proposed by ${historySideText(proposal.proposedBySide, viewer).toLowerCase()}` : "New times proposed"}</p>
      <p className="text-caption">{mine ? "Waiting for the other side to pick one." : viewer === "fynix" ? "Waiting for the other side to pick one." : "Pick one from the buttons above and the meeting moves."}</p>
      <ul className="flex flex-col gap-1">
        {proposal.proposedTimes.map((time) => (
          <li key={time} className="text-row font-medium">
            <Times at={time} hostZone={hostZone} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const RESCHEDULE_STATUS: Readonly<Record<string, string>> = { accepted: "A time was picked", superseded: "Replaced or closed" };

/** The proposals that were answered or replaced, newest first: who offered, what happened. */
function RescheduleHistory({ proposals, viewer }: { proposals: readonly RescheduleView[]; viewer: LeadViewer }) {
  if (proposals.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption font-semibold text-ink-muted">Reschedule history</p>
      <ul className="flex flex-col gap-1.5">
        {proposals.map((entry) => (
          <li key={entry.id} className="rounded-md bg-tonal px-3.5 py-2.5 text-body text-ink-2">
            <span className="font-semibold text-ink">{historySideText(entry.proposedBySide, viewer)}</span> proposed {entry.proposedTimes.length === 1 ? "one time" : `${entry.proposedTimes.length} times`} on <When at={entry.createdAt} style="day" />
            <span className="block text-caption text-ink-muted">
              {RESCHEDULE_STATUS[entry.status] ?? entry.status}
              {entry.pickedTime !== null ? ": " : ""}
              {entry.pickedTime !== null ? <When at={entry.pickedTime} /> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One lead, for any of the four portals. What the viewer may read was already decided by the read that built `record`; this only lays it out.
 * `extraFacts` carries what only one side has (Fynix: the client and the sender).
 */
export function LeadRecordView({
  record,
  viewer,
  backHref,
  availabilityHref,
  extraFacts = [],
  now,
  isCoordinator = false,
  draftHref,
  joins = [],
}: {
  readonly record: LeadRecord;
  readonly viewer: LeadViewer;
  readonly backHref: string;
  readonly availabilityHref?: string;
  readonly extraFacts?: readonly (readonly [string, React.ReactNode])[];
  readonly now: Date;
  /** The coordinator's portal: only it may ask Fynix to review a rejection. */
  readonly isCoordinator?: boolean;
  /** Where a draft is continued (the lead form with `?draft=`). Only the source organisation reads a draft. */
  readonly draftHref?: string;
  /** Who joined the meeting's room, read after it ends. Empty until the import has run. */
  readonly joins?: readonly MeetingJoinRecord[];
}) {
  const { prospect, bant, meeting, decision } = record;
  const facts = recordFacts(record, viewer, now, { isCoordinator });
  const isDraft = record.stage === "draft";
  const closed = isClosed(record.campaignStatus);
  const countdown = record.stage === "awaiting_decision" && record.outcomeRecordedAt !== null ? autoAcceptCountdown(record.outcomeRecordedAt, now) : null;
  const hostLine = record.host.name ?? record.host.jobTitle;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={prospect.name}
        description={`${prospect.title}, ${prospect.company}`}
        actions={
          <>
            {isDraft ? null : viewer === "fynix" ? (
              <>
                <LeadMessagesButton leadId={record.id} side="client_fynix" label="Client messages" />
                <LeadMessagesButton leadId={record.id} side="supplier_fynix" label="Coordinator messages" />
              </>
            ) : viewer === "client" || isCoordinator ? (
              <LeadMessagesButton leadId={record.id} />
            ) : null}
            <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft aria-hidden weight="bold" />
              All leads
            </Link>
          </>
        }
      />

      <Panel aria-label="Lead summary">
        <div className="flex flex-wrap items-center gap-2 px-6 pt-5 pb-4">
          <span className="rounded-xs bg-navy-05 px-1.5 py-0.5 font-mono text-caption font-medium text-ink-2">{record.publicRef}</span>
          <StatusChip kind="lead" status={record.stage as LeadStage} />
          <span className="flex items-center gap-1.5 text-body text-ink-2">
            {record.campaignName}
            {closed ? <ClosedTag /> : null}
          </span>
          {record.overShare && viewer !== "client" ? (
            <Badge variant="amber" size="sm">
              Over share
            </Badge>
          ) : null}
          {record.reviewRequest !== null && viewer !== "client" ? (
            <Badge variant="peach" size="sm">
              Review requested
            </Badge>
          ) : null}
          {isDraft ? null : (
            <span className="text-label text-ink-muted">
              Submitted <When at={record.submittedAt} style="day" />
            </span>
          )}
        </div>
        {isDraft && draftHref !== undefined ? (
          <div className="flex flex-wrap items-center gap-2 bg-navy-03 px-6 py-4">
            <p className="flex-1 text-body text-ink-2">This is a draft. Only your company can see it until you send it.</p>
            <Link href={draftHref} className={buttonVariants({ variant: "default" })}>
              <PencilSimple aria-hidden weight="bold" />
              Continue
            </Link>
            <ConfirmAction
              action={discardDraftAction}
              fields={{ leadId: record.id }}
              trigger="Discard draft"
              triggerLabel={`Discard the draft for ${prospect.name}`}
              title="Discard this draft?"
              description="The draft is removed. It was never sent, so the client does not know about it."
              confirmLabel="Discard draft"
              savedMessage="Draft discarded"
            />
          </div>
        ) : null}
        {facts.contestLabel !== null ? <p className="px-6 pb-4 text-body font-medium text-amber-text">{`Contest outcome: ${facts.contestLabel}. The other side recorded how the meeting went.`}</p> : null}
        {facts.reviewLabel !== null && isCoordinator ? <p className="px-6 pb-4 text-body font-medium text-ink-2">{`You can ask Fynix to review this rejection: ${facts.reviewLabel}.`}</p> : null}
        {countdown !== null ? (
          <p className={`px-6 pb-4 text-body font-medium ${countdown.urgent ? "text-amber-text" : "text-ink-2"}`}>{countdown.label}</p>
        ) : null}
        <LeadActionBar
          viewer={viewer}
          stage={record.stage}
          leadId={record.id}
          prospectName={prospect.name}
          meetingId={meeting?.id ?? null}
          meetingTime={record.scheduledMeetingTime}
          now={now}
          availabilityHref={availabilityHref}
          context={facts.context}
        />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Panel aria-label="Prospect">
            <PanelHeader title="Prospect" />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Facts
                items={[
                  ["Name", prospect.name],
                  ["Job title", prospect.title],
                  ["Company", prospect.company],
                  ["Website", prospect.domain],
                  ["Email", prospect.email],
                  ["Phone", prospect.phone ?? "Not given"],
                  ["LinkedIn", safeLink(prospect.linkedinUrl)],
                ]}
              />
              {prospect.notes ? <Quote label="Notes from the sender">{prospect.notes}</Quote> : null}
            </div>
          </Panel>

          <Panel aria-label="Qualification">
            <PanelHeader title="Qualification" />
            <div className="px-5 pb-5">
              <Facts
                items={[
                  ["Budget", bant.budget],
                  ["Authority", bant.authority],
                  ["Need", bant.need],
                  ["Timeline", bant.timeline],
                ]}
              />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel aria-label="Meeting">
            <PanelHeader title="Meeting" />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Facts
                items={[
                  ...(record.scheduledMeetingTime === null ? [] : ([["Scheduled for", <Times key="at" at={record.scheduledMeetingTime} hostZone={record.hostTimeZone} />]] as const)),
                  ...(hostLine === null ? [] : ([["Team member", hostLine]] as const)),
                  ...(record.alias === null ? [] : ([["Sent as", `${record.alias.displayName}, ${record.alias.jobTitle}`]] as const)),
                  ...extraFacts,
                ]}
              />
              {record.scheduledMeetingTime !== null && meeting !== null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <JoinMeetButton url={meeting.googleMeetUrl} />
                  <DownloadIcsButton
                    meeting={{
                      id: meeting.id,
                      publicRef: meeting.publicRef,
                      campaignName: record.campaignName,
                      prospectName: prospect.name,
                      prospectCompany: prospect.company,
                      googleMeetUrl: meeting.googleMeetUrl,
                      scheduledStartTime: meeting.scheduledStartTime,
                      durationMinutes: meeting.durationMinutes,
                      outcome: meeting.outcome,
                    }}
                  />
                </div>
              ) : null}
              {facts.openProposal !== null ? <ProposalNotice proposal={facts.openProposal} viewer={viewer} hostZone={record.hostTimeZone} /> : null}
              {record.scheduledMeetingTime === null && record.proposedTimes.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-caption font-semibold text-ink-muted">Proposed times</p>
                  <ul className="flex flex-col gap-1.5">
                    {record.proposedTimes.map((time) => (
                      <li key={time} className="rounded-md bg-tonal px-3.5 py-2.5 text-row font-medium">
                        <Times at={time} hostZone={record.hostTimeZone} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {meeting !== null && meeting.outcome !== "scheduled" ? (
                <p className="text-body text-ink-2">
                  Outcome: {meeting.outcome === "held" ? "meeting held" : meeting.outcome === "client_no_show" ? "client no-show" : meeting.outcome === "prospect_no_show" ? "prospect no-show" : meeting.outcome}
                  {record.stage === "prospect_no_show" ? ". The lead is closed and counts as zero. Nothing more to do." : ""}
                </p>
              ) : null}
              {meeting !== null && meeting.contestedAt !== null ? (
                <Quote label={`Outcome contested by ${contesterText(meeting.contestedByRole, viewer)}`}>{meeting.contestNote ?? ""}</Quote>
              ) : null}
              <RescheduleHistory proposals={record.reschedules.filter((entry) => entry.status !== "open")} viewer={viewer} />
            </div>
          </Panel>

          {showsJoinBlock(meeting, now) ? <WhoJoined joins={joins} /> : null}

          {record.reviewRequest !== null && viewer !== "client" ? (
            <Panel aria-label="Review request">
              <PanelHeader title="Review requested" />
              <div className="flex flex-col gap-3 px-5 pb-5">
                <Quote label={viewer === "fynix" ? "The coordinator's note" : "Your note"}>{record.reviewRequest.note}</Quote>
                <p className="text-label text-ink-muted">
                  <When at={record.reviewRequest.requestedAt} />
                  {record.reviewRequest.status === "resolved" ? ". Fynix has answered." : ". Waiting for Fynix."}
                </p>
              </div>
            </Panel>
          ) : null}

          {decision !== null ? (
            <Panel aria-label="Decision">
              <PanelHeader title="Decision" />
              <div className="flex flex-col gap-3 px-5 pb-5">
                <Quote label={decisionNoteLabel(viewer, decision.source, decision.byName)}>{decision.note}</Quote>
                {decision.at !== null ? (
                  <p className="text-label text-ink-muted">
                    <When at={decision.at} />
                  </p>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel aria-label="History">
        <PanelHeader title="History" count={record.history.length} />
        {record.history.length === 0 ? (
          <p className="px-5 pb-5 text-body text-ink-muted">Nothing has happened to this lead yet.</p>
        ) : (
          <ol className="flex flex-col px-5 pb-4">
            {record.history.map((row) => {
              const change = stageChangeText(row.fromStage, row.toStage);
              return (
                <li key={row.id} className="flex flex-col gap-0.5 py-3 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none">
                  <p className="text-row font-semibold">{historyActionText(row.action)}</p>
                  <p className="text-label text-ink-muted">
                    {historySideText(row.by, viewer)}
                    {row.actorName !== null ? `, ${row.actorName}` : ""} <When at={row.at} />
                    {change !== null ? `. ${change}` : ""}
                  </p>
                  {row.note ? <p className="mt-1 text-body whitespace-pre-line text-ink-2">{row.note}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}
