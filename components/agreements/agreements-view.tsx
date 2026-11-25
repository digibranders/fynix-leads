import { AUTO_ACCEPT_HOURS } from "@/lib/leads/decision-queue";
import { CheckCircle, Handshake } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Facts } from "@/components/kit/facts";
import { Panel, Tonal } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { Badge } from "@/components/ui/badge";
import type { TenantAgreementCard } from "@/server/domain/agreement-cards";
import type { TenantAgreementVersion } from "@/server/domain/agreements-tenant";
import { AcceptAgreementButton } from "./accept-agreement-button";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The three numbers of one version and the counting rules. */
function Terms({ version }: { readonly version: TenantAgreementVersion }) {
  return (
    <>
      <Facts
        className="sm:grid-cols-3"
        items={[
          ["Monthly target", `${version.monthlyTarget} meetings`],
          ["Total target", `${version.totalTarget} meetings`],
          ["Client decision window", `${AUTO_ACCEPT_HOURS} hours`],
        ]}
      />
      {version.rules.trim() !== "" ? (
        <div>
          <h4 className="text-label font-semibold text-ink">Rules</h4>
          <p className="mt-1 max-w-[72ch] text-body whitespace-pre-line text-ink-2">{version.rules}</p>
        </div>
      ) : null}
    </>
  );
}

/** Who has accepted a version: your side with the person and the day, the other side with the day only. */
function Acceptance({ version, ownLabel, otherLabel }: { readonly version: TenantAgreementVersion; readonly ownLabel: string; readonly otherLabel: string }) {
  return (
    <ul className="flex flex-col gap-0.5 text-table text-ink-2">
      <li>{version.ownSide === null ? `${ownLabel}: waiting` : `${ownLabel}: accepted by ${version.ownSide.by} on ${DATE.format(version.ownSide.at)}`}</li>
      <li>{version.otherSideAcceptedAt === null ? `${otherLabel}: waiting` : `${otherLabel}: accepted on ${DATE.format(version.otherSideAcceptedAt)}`}</li>
    </ul>
  );
}

/**
 * The agreement of each campaign: the version in force, a newer version waiting with an Accept button (a manager confirms first), and the
 * history. Closed campaigns come last and are read only. `otherLabel` names the other side in the acceptance lines.
 */
export function AgreementsView({ cards, canAccept, emptyText, otherLabel }: { readonly cards: readonly TenantAgreementCard[]; readonly canAccept: boolean; readonly emptyText: string; readonly otherLabel: string }) {
  if (cards.length === 0) {
    return (
      <Panel>
        <EmptyState icon={Handshake} title="No agreement published yet">
          {emptyText}
        </EmptyState>
      </Panel>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {cards.map((card) => (
        <li key={card.campaignId}>
          <Panel aria-label={card.campaignName} className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-name font-semibold tracking-title text-balance">{card.campaignName}</h2>
                <p className="mt-0.5 text-body text-ink-muted">{card.clientName}</p>
              </div>
              {card.closed ? <Badge variant="amber">Closed, read only</Badge> : null}
            </div>

            {card.inForce !== null ? (
              <section aria-label="In force" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-label font-semibold text-ink">In force: version {card.inForce.version}</h3>
                  <StatusChip kind="agreement" status="accepted" />
                  <span className="text-caption text-ink-muted">Published {DATE.format(card.inForce.publishedAt)}</span>
                </div>
                <Terms version={card.inForce} />
              </section>
            ) : (
              <p className="text-body text-ink-2">No version is in force yet. It starts when both sides have accepted one.</p>
            )}

            {card.pending !== null ? (
              <Tonal className="flex flex-col gap-3" aria-label="Waiting for acceptance">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-label font-semibold text-ink">{card.inForce === null ? `Version ${card.pending.version}` : `Newer version ${card.pending.version}`}</h3>
                  <StatusChip kind="agreement" status="waiting" />
                  <span className="text-caption text-ink-muted">Published {DATE.format(card.pending.publishedAt)}</span>
                </div>
                {card.inForce !== null ? <p className="text-table text-ink-2">Version {card.inForce.version} stays in force until both sides accept this one.</p> : null}
                <Terms version={card.pending} />
                <Acceptance version={card.pending} ownLabel="Your side" otherLabel={otherLabel} />
                {card.pending.ownSide !== null ? (
                  <p className="flex items-center gap-2 text-body text-ink-2">
                    <CheckCircle aria-hidden size={18} weight="fill" className="text-green-solid" />
                    Your side has accepted. It waits for the other side.
                  </p>
                ) : card.closed ? (
                  <p className="text-body text-ink-2">This campaign is closed, so nothing can be accepted.</p>
                ) : canAccept ? (
                  <AcceptAgreementButton
                    agreementId={card.pending.id}
                    summary={{ campaignName: card.campaignName, version: card.pending.version, monthlyTarget: card.pending.monthlyTarget, totalTarget: card.pending.totalTarget, disputeWindowHours: card.pending.disputeWindowHours }}
                  />
                ) : (
                  <p className="text-body text-ink-2">A manager of your organisation accepts agreements.</p>
                )}
              </Tonal>
            ) : null}

            {card.history.length > 0 ? (
              <section aria-label="History" className="pt-4 shadow-[inset_0_1px_0_var(--line)]">
                <h3 className="text-label font-semibold text-ink">History</h3>
                <ul className="mt-2 flex flex-col gap-1.5 text-table text-ink-2">
                  {card.history.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>
                        Version {row.version}: {row.monthlyTarget} a month, {row.totalTarget} in total
                      </span>
                      <span className="text-ink-muted">Published {DATE.format(row.publishedAt)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Panel>
        </li>
      ))}
    </ul>
  );
}
