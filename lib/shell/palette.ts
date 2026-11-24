/** The palette's pure rules: which pages match what was typed, how long to wait before asking the server, and the order of the result groups. */

/** The server is asked only for two characters or more, and after the typing has paused. */
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;

export function shouldSearchServer(query: string): boolean {
  return query.trim().length >= SEARCH_MIN_CHARS;
}

/** The pages whose label contains the text, case ignored. Nothing typed keeps every page. */
export function matchPages<T extends { readonly label: string }>(pages: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  return needle === "" ? pages : pages.filter((page) => page.label.toLowerCase().includes(needle));
}

export interface PaletteHit {
  readonly label: string;
  readonly detail: string | null;
  readonly href: string;
}

export interface PaletteResults {
  readonly leads: readonly PaletteHit[];
  readonly people: readonly PaletteHit[];
  readonly companies: readonly PaletteHit[];
}

export interface PaletteGroup {
  readonly key: "leads" | "people" | "companies";
  readonly heading: string;
  readonly hits: readonly PaletteHit[];
}

/** The result groups in the order they are shown, leaving out an empty one. */
export function resultGroups(results: PaletteResults | null): readonly PaletteGroup[] {
  if (results === null) return [];
  const groups: readonly PaletteGroup[] = [
    { key: "leads", heading: "Leads", hits: results.leads },
    { key: "people", heading: "People", hits: results.people },
    { key: "companies", heading: "Companies", hits: results.companies },
  ];
  return groups.filter((group) => group.hits.length > 0);
}
