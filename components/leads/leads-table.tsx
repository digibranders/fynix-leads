"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, CaretUpDown } from "@phosphor-icons/react";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { StatusBadge } from "@/components/status/status-badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REJECTION_REASONS } from "@/lib/domain/rejection-reasons";
import { primaryMeeting } from "@/lib/domain/primary-meeting";
import type { AgencyLead } from "@/lib/leads/agency-view";
import { clarificationNote } from "@/lib/leads/feedback";
import type { LeadSort, SortKey } from "@/lib/leads/filter";
import { formatDayInZone, formatTimeInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

// Sorting and filtering happen outside the table (lib/leads/filter), so the table needs no features of its own.
const features = tableFeatures({});
const column = createColumnHelper<typeof features, AgencyLead>();

/** The column each sortable header sorts by. */
const SORT_KEY: Record<string, SortKey> = { company: "company", approval: "approval", submitted: "submittedAt" };

/** Share of the table width per column, as in the approved mockup (1152px wide). */
const WIDTHS = [78, 168, 146, 146, 140, 98, 96, 176, 104];

function DayAndTime({ iso, zone, strong }: { iso: string; zone: string; strong?: boolean }) {
  const date = new Date(iso);
  return (
    <>
      <span className={cn("block text-[13px] leading-[17px]", strong ? "font-medium text-ink" : "text-ink")}>
        {formatDayInZone(date, zone)}
      </span>
      <span className="block text-caption text-ink-muted">{formatTimeInZone(date, zone)}</span>
    </>
  );
}

/** A faint 10 by 2px bar for an empty cell. */
function None() {
  return <span role="img" aria-label="None" className="inline-block h-0.5 w-2.5 rounded-[2px] bg-navy-10 align-middle" />;
}

/** What the client told the agency: the rejection reason and note, or an open clarification. Null when there is nothing to say. */
function feedbackOf(lead: AgencyLead): React.ReactNode | null {
  if (lead.approval === "needs_clarification") {
    const note = clarificationNote(lead.lastMessageSide);
    return (
      <>
        <span className="block text-caption text-ink-2">Clarification requested</span>
        {note && <span className="block text-caption text-ink-muted">{note}</span>}
      </>
    );
  }
  if (lead.approval === "rejected" && lead.decision) {
    const reason = REJECTION_REASONS.find((r) => r.code === lead.decision?.reasonCode)?.label;
    if (reason || lead.decision.note) {
      return (
        <>
          {reason && <span className="block text-caption text-ink-2">{reason}</span>}
          {lead.decision.note && <span className="block text-caption text-ink-muted">{lead.decision.note}</span>}
        </>
      );
    }
  }
  return null;
}

function createColumns(zone: string) {
  return column.columns([
    column.accessor("ref", {
      id: "ref",
      header: "Ref",
      cell: (info) => <span className="font-mono text-caption font-medium whitespace-nowrap text-ink-muted">{info.getValue()}</span>,
    }),
    column.accessor((lead) => lead.prospect.name, {
      id: "prospect",
      header: "Prospect",
      cell: (info) => <span className="text-[13px] leading-[17px] font-semibold">{info.getValue()}</span>,
    }),
    column.accessor((lead) => lead.prospect.company, { id: "company", header: "Company" }),
    column.accessor((lead) => lead.prospect.title, { id: "title", header: "Job title" }),
    column.accessor("approval", {
      id: "approval",
      header: "Approval",
      cell: (info) => <StatusBadge kind="approval" status={info.getValue()} size="sm" />,
    }),
    column.accessor((lead) => primaryMeeting(lead.meetings)?.status, {
      id: "meeting",
      header: "Meeting status",
      cell: (info) => {
        const status = info.getValue();
        return status ? (
          <StatusBadge kind="meeting" status={status} className="whitespace-normal" />
        ) : (
          <span className="text-ink-muted">No meeting</span>
        );
      },
    }),
    column.accessor((lead) => primaryMeeting(lead.meetings)?.startsAt, {
      id: "meetingTime",
      header: "Meeting time",
      cell: (info) => {
        const startsAt = info.getValue();
        return startsAt ? <DayAndTime iso={startsAt} zone={zone} strong /> : <span className="text-ink-muted">Not set</span>;
      },
    }),
    column.display({
      id: "feedback",
      header: "Client feedback",
      cell: (info) => feedbackOf(info.row.original) ?? <None />,
    }),
    column.accessor("submittedAt", {
      id: "submitted",
      header: "Submitted",
      cell: (info) => <DayAndTime iso={info.getValue()} zone={zone} />,
    }),
  ]);
}

type Props = {
  leads: readonly AgencyLead[];
  sort: LeadSort;
  onSort: (key: SortKey) => void;
  /** IANA zone the times are shown in. */
  zone: string;
};

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: LeadSort["dir"]; onClick: () => void }) {
  const Glyph = !active ? CaretUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-full px-1.5 text-xs font-medium transition-colors hover:bg-navy-05 hover:text-ink",
        active && "text-ink",
      )}
    >
      {label}
      <Glyph aria-hidden size={12} weight={active ? "bold" : "regular"} />
    </button>
  );
}

/**
 * The agency lead table. From `md` the table sits in a horizontally scrollable region; under `md` each lead is a compact
 * stacked row. Both renderings are in the markup, and CSS hides one, so assistive tech meets only one.
 */
export function LeadsTable({ leads, sort, onSort, zone }: Props) {
  const columns = useMemo(() => createColumns(zone), [zone]);
  const data = useMemo(() => [...leads], [leads]);
  const table = useTable({ features, columns, data, getRowId: (lead) => lead.ref });

  const total = WIDTHS.reduce((sum, w) => sum + w, 0);

  return (
    <>
      <div
        role="region"
        aria-label="Leads table"
        // A scrollable region must be reachable by keyboard.
        tabIndex={0}
        className="hidden overflow-x-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      >
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[13px] leading-[17px]">
          <colgroup>
            {WIDTHS.map((w, i) => (
              <col key={i} style={{ width: `${(w / total) * 100}%` }} />
            ))}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const key = SORT_KEY[header.column.id];
                  const active = key !== undefined && sort.key === key;
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={key === undefined ? undefined : active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {key === undefined ? (
                        <table.FlexRender header={header} />
                      ) : (
                        <SortHeader label={String(header.column.columnDef.header)} active={active} dir={sort.dir} onClick={() => onSort(key)} />
                      )}
                    </TableHead>
                  );
                })}
              </tr>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2 whitespace-normal">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <ul className="md:hidden">
        {leads.map((lead) => (
          <StackedRow key={lead.ref} lead={lead} zone={zone} />
        ))}
      </ul>
    </>
  );
}

function StackedRow({ lead, zone }: { lead: AgencyLead; zone: string }) {
  const meeting = primaryMeeting(lead.meetings);
  const feedback = feedbackOf(lead);
  return (
    <li className="relative px-3.5 py-3.5 before:absolute before:inset-x-3.5 before:top-0 before:h-px before:bg-line first:before:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-row font-medium">{lead.prospect.name}</p>
          <p className="text-[13px] leading-[19px] font-medium text-ink-2">{lead.prospect.company}</p>
        </div>
        <span className="font-mono text-[11.5px] leading-5 font-medium text-ink-muted">{lead.ref}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge kind="approval" status={lead.approval} size="sm" />
        {meeting && <StatusBadge kind="meeting" status={meeting.status} />}
        <span className="text-caption text-ink-muted">Submitted {formatDayInZone(new Date(lead.submittedAt), zone)}</span>
      </div>
      {feedback && <div className="mt-2.5">{feedback}</div>}
    </li>
  );
}
