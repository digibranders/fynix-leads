import { CalendarBlank, Megaphone, PaperPlaneRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Facts } from "@/components/kit/facts";
import { Panel, Tonal } from "@/components/kit/panel";
import { Meter } from "@/components/kit/stat";
import { StatusChip } from "@/components/kit/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantCampaign } from "@/server/domain/campaigns-tenant";
import { CampaignBriefButton } from "./campaign-brief";
import { AssignCampaignButton, TakeBackButton } from "./campaign-shares";

type Portal = "client" | "supplier" | "agency";

const EMPTY: Record<Portal, string> = {
  client: "Fynix sets your campaigns up with you. Once one exists it appears here with its target and how it is going.",
  supplier: "Fynix assigns campaigns to your account. Once one is assigned it appears here with its target and the share each agency holds.",
  agency: "Fynix has not assigned you a campaign yet. Once it does, the campaign appears here and in the Campaign list when you submit a lead.",
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A campaign date is a calendar day with no clock time, so it is read and shown in UTC and never shifts with a zone. */
function day(value: string): string {
  return DAY.format(new Date(`${value}T00:00:00Z`));
}

export interface AssignConfig {
  readonly ownOrgId: string;
  readonly agencies: readonly { readonly id: string; readonly name: string }[];
  readonly canManage: boolean;
}

/** The campaigns a portal can see, read only: what each is, when it runs, its target and how it is going. Fynix creates and assigns them. */
export function CampaignsView({ campaigns, portal, submitHref, assign }: { readonly campaigns: readonly TenantCampaign[]; readonly portal: Portal; readonly submitHref?: string; readonly assign?: AssignConfig }) {
  if (campaigns.length === 0) {
    return (
      <Panel>
        <EmptyState icon={Megaphone} title="No campaigns yet">
          {EMPTY[portal]}
        </EmptyState>
      </Panel>
    );
  }
  return (
    <ul className="grid gap-4 xl:grid-cols-2">
      {campaigns.map((row) => {
        const ofTotal = row.totalTarget > 0 ? Math.min(100, Math.round((row.delivered / row.totalTarget) * 100)) : 0;
        const allocated = (row.share ?? 0) + row.agencies.reduce((sum, agency) => sum + agency.monthlyShare, 0);
        const canSubmit = submitHref !== undefined && row.status === "active";
        return (
          <li key={row.id} className="flex">
            <Panel aria-label={row.name} className="flex w-full flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-section font-semibold tracking-[-0.01em] text-ink">{row.name}</h2>
                  <p className="mt-0.5 text-table text-ink-muted">
                    {portal === "client" ? <span className="font-mono">{row.publicRef}</span> : <>{row.clientBrandName}, <span className="font-mono">{row.publicRef}</span></>}
                  </p>
                </div>
                <StatusChip kind="campaign" status={row.status} />
              </div>

              <p className="flex items-center gap-2 text-table text-ink-2">
                <CalendarBlank aria-hidden size={15} className="shrink-0 text-ink-muted" />
                {day(row.startDate)} to {day(row.endDate)}
              </p>

              <Facts
                className="sm:grid-cols-3"
                items={[
                  ["Delivered", row.delivered],
                  ["In progress", row.inProgress],
                  [portal === "agency" ? "Your monthly share" : "Monthly target", portal === "agency" ? (row.share ?? 0) : row.monthlyTarget],
                ]}
              />

              {portal !== "agency" ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-label text-ink-2">
                    <span>Delivered against the total target of {row.totalTarget}</span>
                    <span className="font-semibold text-ink">{ofTotal}%</span>
                  </div>
                  <Meter value={row.delivered} max={row.totalTarget} label={`${row.name}: ${ofTotal}% of the total target delivered`} />
                </div>
              ) : null}

              {portal === "supplier" ? (
                <Tonal className="flex flex-col gap-1.5 text-table">
                  <h3 className="text-caption font-semibold text-ink-muted">Shares</h3>
                  {row.share !== null ? (
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-ink-2">You</span>
                      <span className="font-semibold text-ink">{row.share} a month</span>
                    </p>
                  ) : null}
                  {row.agencies.map((agency) => (
                    <div key={agency.agencyOrgId} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink-2">{agency.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="font-semibold text-ink">
                          {agency.monthlyShare} a month, {agency.delivered} delivered
                        </span>
                        {assign?.canManage ? <TakeBackButton campaignId={row.id} campaignName={row.name} agencyOrgId={agency.agencyOrgId} agencyName={agency.name} /> : null}
                      </span>
                    </div>
                  ))}
                  {row.share === null && row.agencies.length === 0 ? <p className="text-ink-2">Not assigned to an agency yet.</p> : null}
                  <p className={cn("mt-1 pt-2 text-caption shadow-[inset_0_1px_0_var(--line)]", allocated > row.monthlyTarget ? "font-semibold text-amber-text" : "text-ink-muted")}>
                    {allocated} of {row.monthlyTarget} a month assigned{allocated > row.monthlyTarget ? ", more than the target" : ""}
                  </p>
                </Tonal>
              ) : null}

              {row.brief !== null || assign?.canManage === true || canSubmit ? (
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
                  {canSubmit ? (
                    <Link href={submitHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      <PaperPlaneRight aria-hidden weight="bold" />
                      Submit a lead
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
