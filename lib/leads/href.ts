import type { PipelineKey } from "./pipeline";

/** The URL of a leads list with a filter applied. Empty values are left out so the address stays short and shareable. */
export function leadsHref(basePath: string, filter: { stage?: PipelineKey | null; q?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (filter.stage) params.set("stage", filter.stage);
  if (filter.q && filter.q.trim() !== "") params.set("q", filter.q.trim());
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}
