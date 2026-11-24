/** The columns a leads or meetings table can be sorted by, in the URL as `?sort=key` (ascending) or `?sort=-key` (descending). */
export const SORT_KEYS = ["stage", "prospect", "company", "submitted", "meeting"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface Sort {
  readonly key: SortKey;
  readonly dir: "asc" | "desc";
}

/** Reads `?sort=`. Anything that is not a known key is ignored, so the default order stays. */
export function parseSort(value: string | string[] | undefined): Sort | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const dir = raw.startsWith("-") ? "desc" : "asc";
  const key = SORT_KEYS.find((entry) => entry === raw.replace(/^-/, ""));
  return key === undefined ? null : { key, dir };
}

/** The `?sort=` value for a click on a column: a new column starts ascending, the current one flips. */
export function nextSortValue(current: Sort | null, key: SortKey): string {
  return current?.key === key && current.dir === "asc" ? `-${key}` : key;
}

/** The value as it is written in the URL for a sort, or undefined for none. */
export function sortValue(sort: Sort | null): string | undefined {
  return sort === null ? undefined : sort.dir === "desc" ? `-${sort.key}` : sort.key;
}

type Cell = string | number | null;

/** Sorts a copy by the chosen column. An empty cell (a lead with no meeting) goes last in both directions. Equal rows keep their order. */
export function sortRows<T>(rows: readonly T[], sort: Sort | null, cells: Readonly<Partial<Record<SortKey, (row: T) => Cell>>>): T[] {
  const read = sort === null ? undefined : cells[sort.key];
  if (sort === null || read === undefined) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, cell: read(row) }))
    .sort((a, b) => {
      if (a.cell === null || b.cell === null) return a.cell === b.cell ? a.index - b.index : a.cell === null ? 1 : -1;
      const order = typeof a.cell === "number" && typeof b.cell === "number" ? a.cell - b.cell : String(a.cell).localeCompare(String(b.cell), "en", { sensitivity: "base" });
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map((entry) => entry.row);
}
