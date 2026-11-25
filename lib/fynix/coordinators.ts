import { countOf } from "@/lib/fynix/format";

/** The Active and Archived filter and the row text of the Coordinators screen. */
export type CoordinatorFilter = "active" | "archived";

export interface FilterableCoordinator {
  readonly name: string;
  readonly status: "active" | "archived";
  readonly agencyNames: readonly string[];
}

/** `?status=archived` is the only value that is not the default, so any other text means Active. */
export function parseCoordinatorFilter(value: string | undefined): CoordinatorFilter {
  return value === "archived" ? "archived" : "active";
}

export function filterCoordinators<T extends FilterableCoordinator>(rows: readonly T[], filter: CoordinatorFilter, query: string): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) => row.status === filter && (needle === "" || row.name.toLowerCase().includes(needle) || row.agencyNames.some((name) => name.toLowerCase().includes(needle))),
  );
}

export function filterCounts(rows: readonly { readonly status: "active" | "archived" }[]): Record<CoordinatorFilter, number> {
  return { active: rows.filter((row) => row.status === "active").length, archived: rows.filter((row) => row.status === "archived").length };
}

/** The second line of a row on a phone: "2 agencies, 2 campaigns", or that the invite has not been accepted. */
export function coordinatorSubtitle(row: { readonly agencyCount: number; readonly campaignCount: number; readonly inviteWaiting: boolean }): string {
  if (row.inviteWaiting) return "Invite sent, not accepted yet";
  return `${countOf(row.agencyCount, "agency", "agencies")}, ${countOf(row.campaignCount, "campaign", "campaigns")}`;
}

/** The address of the Coordinators screen with a filter and a search. A value that is the default is left out, so the plain list has a plain address. */
export function coordinatorsHref(options: { readonly status?: CoordinatorFilter; readonly q?: string }): string {
  const query = new URLSearchParams();
  if (options.status === "archived") query.set("status", "archived");
  if (options.q !== undefined && options.q.trim() !== "") query.set("q", options.q.trim());
  const text = query.toString();
  return text === "" ? "/fynix/coordinators" : `/fynix/coordinators?${text}`;
}
