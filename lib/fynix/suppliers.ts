import { countOf } from "@/lib/fynix/format";

/** The Active and Archived filter and the row text of the Suppliers screen. */
export type SupplierFilter = "active" | "archived";

export interface FilterableSupplier {
  readonly name: string;
  readonly status: "active" | "archived";
  readonly agencyNames: readonly string[];
}

/** `?status=archived` is the only value that is not the default, so any other text means Active. */
export function parseSupplierFilter(value: string | undefined): SupplierFilter {
  return value === "archived" ? "archived" : "active";
}

export function filterSuppliers<T extends FilterableSupplier>(rows: readonly T[], filter: SupplierFilter, query: string): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) => row.status === filter && (needle === "" || row.name.toLowerCase().includes(needle) || row.agencyNames.some((name) => name.toLowerCase().includes(needle))),
  );
}

export function filterCounts(rows: readonly { readonly status: "active" | "archived" }[]): Record<SupplierFilter, number> {
  return { active: rows.filter((row) => row.status === "active").length, archived: rows.filter((row) => row.status === "archived").length };
}

/** The second line of a row on a phone: "2 agencies, 2 campaigns", or that the invite has not been accepted. */
export function supplierSubtitle(row: { readonly agencyCount: number; readonly campaignCount: number; readonly inviteWaiting: boolean }): string {
  if (row.inviteWaiting) return "Invite sent, not accepted yet";
  return `${countOf(row.agencyCount, "agency", "agencies")}, ${countOf(row.campaignCount, "campaign", "campaigns")}`;
}
