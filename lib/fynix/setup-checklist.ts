import { countOf } from "@/lib/fynix/format";

/** What still needs set-up, as the domain finds it: a name and the reference its page lives under. */
export interface SetupFindings {
  readonly clientsWithoutManager: readonly { readonly name: string; readonly ref: string }[];
  readonly coordinatorsWithoutManager: readonly { readonly name: string; readonly ref: string }[];
  readonly agenciesWithoutManager: readonly { readonly name: string; readonly ref: string }[];
  readonly campaignsWithoutHost: readonly { readonly name: string; readonly ref: string }[];
  readonly agreementsWaiting: readonly { readonly campaignName: string; readonly ref: string; readonly party: "client" | "supplier" }[];
}

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

/** One line per thing to fix, each linking to the page that fixes it. Empty when everything is set up. */
export function checklistItems(findings: SetupFindings): readonly ChecklistItem[] {
  return [
    ...findings.clientsWithoutManager.map((row) => ({ key: `client-${row.ref}`, label: `${row.name} has no manager yet`, href: `/fynix/clients/${row.ref}/people` })),
    ...findings.coordinatorsWithoutManager.map((row) => ({ key: `coordinator-${row.ref}`, label: `${row.name} has no manager yet`, href: `/fynix/suppliers/${row.ref}/people` })),
    ...findings.agenciesWithoutManager.map((row) => ({ key: `agency-${row.ref}`, label: `${row.name} has no manager yet`, href: `/fynix/agencies/${row.ref}/people` })),
    ...findings.campaignsWithoutHost.map((row) => ({ key: `host-${row.ref}`, label: `${row.name} has no host`, href: `/fynix/campaigns/${row.ref}/hosts` })),
    ...findings.agreementsWaiting.map((row) => ({
      key: `agreement-${row.ref}-${row.party}`,
      label: `${row.campaignName}: the ${row.party === "client" ? "client" : "coordinator"} has not accepted the agreement`,
      href: `/fynix/campaigns/${row.ref}/agreements`,
    })),
  ];
}

/** The count line above the list, for example "3 things to set up". */
export function checklistTitle(items: readonly ChecklistItem[]): string {
  return items.length === 0 ? "Everything is set up" : `${countOf(items.length, "thing", "things")} to set up`;
}
