import { Handshake, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { Badge } from "@/components/ui/badge";

export interface PartnerView {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly active: boolean;
  readonly shares: readonly { readonly campaignName: string; readonly monthlyShare: number }[];
}

/** The partner agencies working under the supplier, and the monthly share of each campaign that each one holds. Fynix adds agencies; this list is read only. */
export function PartnersView({ partners }: { readonly partners: readonly PartnerView[] }) {
  if (partners.length === 0) {
    return (
      <Panel>
        <EmptyState icon={UsersThree} title="No partner agencies yet">
          Ask Fynix to add a partner agency under your supplier account. It will appear here with the share of each campaign it holds.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {partners.map((partner) => {
        const total = partner.shares.reduce((sum, share) => sum + share.monthlyShare, 0);
        return (
          <li key={partner.id} className="contents">
            <Panel aria-label={partner.name} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Person name={partner.name} sub={<span className="font-mono">{partner.publicRef}</span>} />
                <Badge variant={partner.active ? "green" : "quiet"}>{partner.active ? "Active" : "Archived"}</Badge>
              </div>
              {partner.shares.length === 0 ? (
                <p className="text-body text-ink-muted">No campaign share allocated yet.</p>
              ) : (
                <Tonal className="flex flex-col gap-2.5">
                  <p className="flex items-baseline justify-between gap-3 text-caption font-semibold text-ink-muted">
                    <span>Monthly share by campaign</span>
                    <span>{total} a month in all</span>
                  </p>
                  <ul className="flex flex-col gap-2">
                    {partner.shares.map((share) => (
                      <li key={share.campaignName} className="flex items-center justify-between gap-3 text-table">
                        <span className="flex min-w-0 items-center gap-2 text-ink-2">
                          <Handshake aria-hidden size={14} className="shrink-0" />
                          <span className="truncate">{share.campaignName}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-ink">{share.monthlyShare} a month</span>
                      </li>
                    ))}
                  </ul>
                </Tonal>
              )}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
