import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Tonal } from "@/components/kit/panel";
import type { CampaignHeader } from "@/server/domain/campaign-overview";

/** What a campaign being set up still needs before it can be made active, each with the page where it is done. Shown to Fynix above the tabs. */
export function GoLiveChecklist({ campaign }: { campaign: CampaignHeader }) {
  const state = campaign.goLive;
  if (state === null) return null;
  const base = `/fynix/campaigns/${campaign.publicRef}`;
  const steps = [
    { done: state.published, label: "Agreement published", todo: "Publish it on the Agreements and shares tab", href: `${base}/agreements` },
    { done: state.clientAccepted, label: "Accepted by the client", todo: "A client manager accepts it in the client portal", href: `${base}/agreements` },
    { done: state.coordinatorAccepted, label: "Accepted by the coordinator", todo: "A coordinator manager accepts it in the coordinator portal", href: `${base}/agreements` },
    { done: state.hasHost, label: "A client team member to take meetings", todo: "The client needs at least one active person", href: `${base}/team` },
  ] as const;
  const ready = steps.every((step) => step.done);
  return (
    <Tonal aria-label="Before it can go live" className="flex flex-col gap-2 text-table">
      <p className="font-semibold text-ink">{ready ? "Ready to go live. Use Make active." : "Before it can go live"}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-1.5">
            {step.done ? <CheckCircle aria-hidden weight="fill" className="text-green-text" /> : <Circle aria-hidden weight="bold" className="text-amber-text" />}
            {step.done ? (
              <span className="text-ink-2">{step.label}</span>
            ) : (
              <Link href={step.href} title={step.todo} className="text-ink underline underline-offset-2">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Tonal>
  );
}
