import { CheckCircle, Clock, FileText } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Tonal } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { agreementProgress, type AgreementFacts, type AgreementSide } from "@/lib/campaign-agreement";

/**
 * The agreement of one campaign, on its card: published or not, who has accepted, and the next step with a link to where it is done. A campaign goes
 * live only when both the client and the coordinator have accepted, so a campaign still being set up must say where it stands.
 */
export function CampaignAgreementStatus({
  side,
  campaignId,
  agreement,
  href,
  canAccept,
  live,
}: {
  readonly side: AgreementSide;
  readonly campaignId: string;
  readonly agreement: AgreementFacts | null;
  /** The portal's agreement page. The campaign's own card on it is the anchor. */
  readonly href: string;
  readonly canAccept: boolean;
  readonly live: boolean;
}) {
  const progress = agreementProgress(side, agreement, live);
  const target = `${href}#campaign-${campaignId}`;
  const needsMe = progress.step === "you-accept";
  return (
    <Tonal aria-label="Agreement" className="flex flex-col gap-2.5 text-table">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-caption font-semibold text-ink-muted">Agreement</h3>
          <p className="mt-0.5 font-semibold text-ink">{progress.title}</p>
        </div>
        {progress.sides.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1.5">
            {progress.sides.map((entry) => (
              <li key={entry.label} className={entry.accepted ? "inline-flex items-center gap-1 rounded-xs bg-green-soft px-1.5 py-0.5 text-caption font-semibold text-green-text" : "inline-flex items-center gap-1 rounded-xs bg-amber-soft px-1.5 py-0.5 text-caption font-semibold text-amber-text"}>
                {entry.accepted ? <CheckCircle aria-hidden weight="bold" /> : <Clock aria-hidden weight="bold" />}
                {entry.label}: {entry.accepted ? "accepted" : "waiting"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-ink-2">{progress.body}</p>
      {progress.step === "not-published" ? null : needsMe && !canAccept ? (
        <p className="text-caption text-ink-muted">A manager of your organisation accepts agreements.</p>
      ) : (
        <div>
          <Link href={target} className={buttonVariants({ variant: needsMe ? "default" : "secondary", size: "sm" })}>
            <FileText aria-hidden weight="bold" />
            {needsMe ? "Review and accept" : "View agreement"}
          </Link>
        </div>
      )}
    </Tonal>
  );
}
