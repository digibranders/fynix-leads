import type { ApprovalStatus } from "@/lib/domain/status";

export type FilterableLead = {
  ref: string;
  approval: ApprovalStatus;
  submittedAt: string;
  prospect: { name: string; company: string };
};

export type LeadFilter = { query: string; approval: "all" | ApprovalStatus };
export type SortKey = "submittedAt" | "company" | "approval";
export type SortDir = "asc" | "desc";
export type LeadSort = { key: SortKey; dir: SortDir };

/** Case-insensitive match of the query against ref, prospect name and company, then the approval filter. */
export function filterLeads<T extends FilterableLead>(leads: readonly T[], { query, approval }: LeadFilter): T[] {
  const needle = query.trim().toLowerCase();
  return leads.filter((lead) => {
    if (approval !== "all" && lead.approval !== approval) return false;
    if (needle === "") return true;
    return [lead.ref, lead.prospect.name, lead.prospect.company].some((field) => field.toLowerCase().includes(needle));
  });
}

const WORKFLOW_ORDER: Record<ApprovalStatus, number> = {
  draft: 0,
  pending: 1,
  needs_clarification: 2,
  approved: 3,
  rejected: 4,
};

const COMPARE: Record<SortKey, (a: FilterableLead, b: FilterableLead) => number> = {
  submittedAt: (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
  company: (a, b) => a.prospect.company.localeCompare(b.prospect.company, "en", { sensitivity: "base" }),
  approval: (a, b) => WORKFLOW_ORDER[a.approval] - WORKFLOW_ORDER[b.approval],
};

/** A sorted copy. Array sort is stable, so equal keys keep their order in both directions. */
export function sortLeads<T extends FilterableLead>(leads: readonly T[], { key, dir }: LeadSort): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => sign * COMPARE[key](a, b));
}
