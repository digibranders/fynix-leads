import type { SupplierFilter } from "@/lib/fynix/suppliers";

/** The filter, search and row text of the Fynix Agencies screen. The Active and Archived filter is the coordinators' (`parseSupplierFilter`). */
export interface FilterableAgency {
  readonly name: string;
  readonly status: "active" | "archived";
  readonly contactEmail: string | null;
  readonly coordinator: { readonly name: string };
}

/** A search matches the agency's name, its contact email or its coordinator's name, ignoring case. */
export function filterAgencies<T extends FilterableAgency>(rows: readonly T[], filter: SupplierFilter, query: string): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      row.status === filter &&
      (needle === "" || row.name.toLowerCase().includes(needle) || (row.contactEmail ?? "").toLowerCase().includes(needle) || row.coordinator.name.toLowerCase().includes(needle)),
  );
}

/** The address of the Agencies screen with a filter and a search. A value that is the default is left out. */
export function agenciesHref(options: { readonly status?: SupplierFilter; readonly q?: string }): string {
  const query = new URLSearchParams();
  if (options.status === "archived") query.set("status", "archived");
  if (options.q !== undefined && options.q.trim() !== "") query.set("q", options.q.trim());
  const text = query.toString();
  return text === "" ? "/fynix/agencies" : `/fynix/agencies?${text}`;
}

/** The second line of a row on a phone: the coordinator, or that the invite has not been accepted. */
export function agencySubtitle(row: { readonly coordinator: { readonly name: string }; readonly inviteWaiting: boolean }): string {
  return row.inviteWaiting ? `${row.coordinator.name}. Invite sent, not accepted yet` : row.coordinator.name;
}
