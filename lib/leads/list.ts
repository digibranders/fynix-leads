import { inGroup, type PipelineKey } from "./pipeline";

export const PAGE_SIZE = 20;

interface Searchable {
  readonly stage: string;
  readonly campaignId?: string;
  readonly publicRef: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
}

/** Narrows a lead list to a pipeline group and a search word. The search matches the name, company and reference, ignoring case. */
export function filterLeads<T extends Searchable>(leads: readonly T[], filter: { group: PipelineKey | null; q: string; campaign?: string | null }): T[] {
  const needle = filter.q.trim().toLowerCase();
  return inGroup(leads, filter.group).filter(
    (lead) =>
      (!filter.campaign || lead.campaignId === filter.campaign) &&
      (needle === "" ||
      lead.prospectName.toLowerCase().includes(needle) ||
      lead.prospectCompany.toLowerCase().includes(needle) ||
      lead.publicRef.toLowerCase().includes(needle)),
  );
}

export interface Page<T> {
  readonly rows: T[];
  /** 1-based, clamped into range. */
  readonly page: number;
  readonly pages: number;
  /** 1-based position of the first and last row shown; both 0 when there are no rows. */
  readonly from: number;
  readonly to: number;
  readonly total: number;
}

/** One page of a list. A page number that is not a whole number, or is out of range, is clamped rather than trusted. */
export function paginate<T>(items: readonly T[], requested: number, size: number = PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), pages) : 1;
  const start = (page - 1) * size;
  const rows = items.slice(start, start + size);
  return { rows, page, pages, from: rows.length === 0 ? 0 : start + 1, to: start + rows.length, total: items.length };
}

/** Reads `?page=` from the URL. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined ? 1 : Number(raw);
}
