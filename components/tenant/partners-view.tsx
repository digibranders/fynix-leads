import { Handshake, UsersThree } from "@phosphor-icons/react/dist/ssr";

export interface PartnerView {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly active: boolean;
  readonly shares: readonly { readonly campaignName: string; readonly monthlyShare: number }[];
}

/** The partner agencies working under the supplier, and the monthly share of each campaign that each one holds. */
export function PartnersView({ partners }: { readonly partners: readonly PartnerView[] }) {
  if (partners.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-8 text-center shadow-raised">
        <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><UsersThree aria-hidden size={20} /></span>
        <p className="text-row font-semibold text-ink">No partner agencies yet</p>
        <p className="max-w-[44ch] text-table text-ink-2">Ask Fynix to add a partner agency under your supplier account. It will appear here with the share of each campaign it holds.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {partners.map((partner) => (
        <li key={partner.id} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-raised">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-value font-semibold text-ink">{partner.name}</h2>
              <p className="font-mono text-caption text-ink-muted">{partner.publicRef}</p>
            </div>
            <span className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-label font-semibold ${partner.active ? "bg-green-soft text-green-text" : "bg-navy-05 text-ink-2"}`}>{partner.active ? "Active" : "Archived"}</span>
          </div>
          {partner.shares.length === 0 ? (
            <p className="text-table text-ink-2">No campaign share allocated yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 rounded-md bg-navy-04 p-4 text-table">
              {partner.shares.map((share) => (
                <li key={share.campaignName} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-ink-2"><Handshake aria-hidden size={14} className="shrink-0" /><span className="truncate">{share.campaignName}</span></span>
                  <span className="shrink-0 font-semibold text-ink">{share.monthlyShare} a month</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
