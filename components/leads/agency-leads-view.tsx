"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { approvalLabel, type ApprovalStatus } from "@/lib/domain/status";
import type { AgencyLead } from "@/lib/leads/agency-view";
import { filterLeads, sortLeads, toggleSort, type LeadFilter, type LeadSort } from "@/lib/leads/filter";
import { zoneAbbreviation } from "@/lib/time/zones";
import { LeadsTable } from "./leads-table";

type Segment = LeadFilter["approval"];

const SEGMENTS: readonly Segment[] = ["all", "pending", "needs_clarification", "approved", "rejected"];
const segmentLabel = (segment: Segment): string => (segment === "all" ? "All" : approvalLabel(segment as ApprovalStatus));

// Newest submission first until a header is clicked.
const DEFAULT_SORT: LeadSort = { key: "submittedAt", dir: "desc" };

type Props = {
  leads: readonly AgencyLead[];
  /** IANA zone for every time in the table. */
  zone: string;
  /** Used only to name the zone in the toolbar, for example "IST". */
  now: string;
};

/** The "All leads" panel: toolbar with filter and search, then the table or an empty state. */
export function AgencyLeadsView({ leads, zone, now }: Props) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<LeadSort>(DEFAULT_SORT);

  const visible = useMemo(() => sortLeads(filterLeads(leads, { query, approval: segment }), sort), [leads, query, segment, sort]);
  // Segment counts follow the search, so each count is what that segment would show.
  const counts = useMemo(() => {
    const searched = filterLeads(leads, { query, approval: "all" });
    return Object.fromEntries(SEGMENTS.map((s) => [s, s === "all" ? searched.length : searched.filter((l) => l.approval === s).length]));
  }, [leads, query]);

  const clearFilters = () => {
    setQuery("");
    setSegment("all");
  };

  return (
    <section aria-labelledby="all-leads-title" className="min-w-0 overflow-hidden rounded-lg bg-surface px-2 pb-2.5 shadow-raised">
      <div className="flex min-h-[68px] flex-wrap items-center gap-x-4 gap-y-3 py-3 pr-1.5 pl-3.5">
        <div className="flex items-center gap-4">
          <h2 id="all-leads-title" className="text-[16px] leading-5 font-semibold tracking-[-0.005em]">
            All leads
          </h2>
          <span className="grid h-6 min-w-[26px] place-items-center rounded-full bg-navy-07 px-2 text-label font-semibold text-ink-2">
            {visible.length}
          </span>
          <span className="text-[13px] text-ink-muted">Times in {zoneAbbreviation(new Date(now), zone)}</span>
        </div>

        <Tabs value={segment} onValueChange={(value) => setSegment(value as Segment)} className="-m-1 max-w-full min-w-0 p-1 xl:ml-auto">
          <div className="max-w-full overflow-x-auto p-0.5 [scrollbar-width:none]">
            <TabsList aria-label="Filter by approval">
              {SEGMENTS.map((s) => (
                <TabsTrigger key={s} value={s} className="px-3.5">
                  {segmentLabel(s)} <b>{counts[s]}</b>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <InputGroup className="h-10 w-full md:w-[252px]">
          <InputGroupAddon>
            <MagnifyingGlass aria-hidden className="size-[17px]" />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, company or ref"
            aria-label="Search leads by name, company or ref"
            autoComplete="off"
            className="text-[13.5px]"
          />
        </InputGroup>
      </div>

      <p aria-live="polite" className="sr-only">
        Showing {visible.length} of {leads.length}
      </p>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-3.5 py-10">
          <p className="text-value font-semibold">No leads match these filters.</p>
          <p className="max-w-[52ch] text-body text-ink-2">Check the spelling of the name, company or reference, or pick another approval status.</p>
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <LeadsTable leads={visible} sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} zone={zone} />
      )}
    </section>
  );
}
