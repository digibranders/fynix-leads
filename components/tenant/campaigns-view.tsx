import { CalendarBlank, Megaphone, PaperPlaneRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusChip } from "@/components/fynix/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { CampaignBriefButton } from "./campaign-brief";
import { AssignCampaignButton, TakeBackButton } from "./campaign-shares";
import type { TenantCampaign } from "@/server/domain/campaigns-tenant";

type Portal = "client" | "supplier" | "agency";

const EMPTY: Record<Portal, string> = {
  client: "Fynix sets your campaigns up with you. Once one exists it appears here with its target and how it is going.",
  supplier: "Fynix assigns campaigns to your account. Once one is assigned it appears here with its target and the share each agency holds.",
  agency: "Fynix has not assigned you a campaign yet. Once it does, the campaign appears here and in the Campaign list when you submit a lead.",
};

function day(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Figure({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="rounded-md bg-navy-04 px-4 py-3">
      <p className="text-caption font-semibold text-ink-muted">{label}</p>
      <p className="mt-0.5 text-value font-semibold tracking-[-0.005em] text-ink">{value}</p>
    </div>
  );
}

/** The campaigns a portal can see, read only: what each is, when it runs, its target and how it is going. Fynix creates and assigns them. */
export function CampaignsView({ campaigns, portal, submitHref, assign }: { readonly campaigns: readonly TenantCampaign[]; readonly portal: Portal; readonly submitHref?: string; readonly assign?: { readonly ownOrgId: string; readonly agencies: readonly { readonly id: string; readonly name: string }[]; readonly canManage: boolean } }) {
  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-8 text-center shadow-raised">
        <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><Megaphone aria-hidden size={20} /></span>
        <p className="text-row font-semibold text-ink">No campaigns yet</p>
        <p className="max-w-[48ch] text-table text-ink-2">{EMPTY[portal]}</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 xl:grid-cols-2">
      {campaigns.map((row) => {
        const ofTotal = row.totalTarget > 0 ? Math.min(100, Math.round((row.delivered / row.totalTarget) * 100)) : 0;
        return (
          <li key={row.id} className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-value font-semibold text-ink">{row.name}</h2>
                <p className="mt-0.5 text-table text-ink-2">
                  {portal === "client" ? row.publicRef : `${row.clientBrandName}, ${row.publicRef}`}
                </p>
              </div>
              <StatusChip kind="campaign" status={row.status} size="sm" />
            </div>

            <p className="flex items-center gap-2 text-table text-ink-2">
              <CalendarBlank aria-hidden size={15} className="shrink-0" />
              {day(row.startDate)} to {day(row.endDate)}
            </p>

            <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
              <Figure label="Delivered" value={row.delivered} />
              <Figure label="In progress" value={row.inProgress} />
              <Figure label={portal === "agency" ? "Your monthly share" : "Monthly target"} value={portal === "agency" ? (row.share ?? 0) : row.monthlyTarget} />
            </div>

            {portal !== "agency" ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-caption text-ink-2">
                  <span>Delivered against the total target of {row.totalTarget}</span>
                  <span className="font-semibold text-ink">{ofTotal}%</span>
                </div>
                <div role="progressbar" aria-label={`${row.name}: ${ofTotal}% of the total target delivered`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ofTotal} className="h-2 overflow-hidden rounded-full bg-navy-07">
                  <div className="h-full rounded-full bg-navy" style={{ width: `${ofTotal}%` }} />
                </div>
              </div>
            ) : null}

            {portal === "supplier" ? (
              <div className="flex flex-col gap-1.5 rounded-md bg-navy-04 p-4 text-table">
                <p className="text-caption font-semibold text-ink-muted">Shares</p>
                {row.share !== null ? (
                  <p className="flex items-center justify-between gap-3"><span className="text-ink-2">You</span><span className="font-semibold text-ink">{row.share} a month</span></p>
                ) : null}
                {row.agencies.map((agency) => (
                  <div key={agency.agencyOrgId} className="flex items-center justify-between gap-3">
                    <span className="truncate text-ink-2">{agency.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-semibold text-ink">{agency.monthlyShare} a month, {agency.delivered} delivered</span>
                      {assign?.canManage ? <TakeBackButton campaignId={row.id} agencyOrgId={agency.agencyOrgId} agencyName={agency.name} /> : null}
                    </span>
                  </div>
                ))}
                {row.share === null && row.agencies.length === 0 ? <p className="text-ink-2">Not assigned to an agency yet.</p> : null}
                {(() => {
                  const allocated = (row.share ?? 0) + row.agencies.reduce((sum, agency) => sum + agency.monthlyShare, 0);
                  return (
                    <p className={`mt-1 pt-2 text-caption shadow-[inset_0_1px_0_var(--line)] ${allocated > row.monthlyTarget ? "font-semibold text-amber-text" : "text-ink-muted"}`}>
                      {allocated} of {row.monthlyTarget} a month assigned{allocated > row.monthlyTarget ? ", more than the target" : ""}
                    </p>
                  );
                })()}
              </div>
            ) : null}

            {row.brief !== null || assign?.canManage === true || (submitHref !== undefined && row.status === "active") ? (
              <div className="flex flex-wrap items-center gap-2">
                {row.brief !== null ? <CampaignBriefButton name={row.name} brief={row.brief} /> : null}
                {assign?.canManage === true ? (
                  <AssignCampaignButton
                    campaignId={row.id}
                    campaignName={row.name}
                    options={[
                      { id: assign.ownOrgId, name: "Your own team", current: row.share },
                      ...assign.agencies.map((agency) => ({ id: agency.id, name: agency.name, current: row.agencies.find((line) => line.agencyOrgId === agency.id)?.monthlyShare ?? null })),
                    ]}
                  />
                ) : null}
                {submitHref !== undefined && row.status === "active" ? (
                <Link href={submitHref} className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5" })}>
                  <PaperPlaneRight aria-hidden size={14} weight="bold" />
                  Submit a lead
                </Link>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
