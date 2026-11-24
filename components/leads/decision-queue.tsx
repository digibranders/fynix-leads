import { Check, ListChecks, X } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { ClosedTag } from "@/components/kit/closed-tag";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { isClosed } from "@/lib/campaign-status";
import { autoAcceptCountdown } from "@/lib/leads/decision-queue";
import { cn } from "@/lib/utils";
import type { DecisionItem } from "@/server/domain/client-queue";
import { DecideLeadForm } from "./lead-forms";

/**
 * Leads whose meeting was held and that wait for the client: how long until each is accepted on its own, and Accept or Reject with a note. The
 * sheets state the consequence and need the note before the last button. Closest to automatic acceptance first.
 */
export function DecisionQueue({ items, now }: { readonly items: readonly DecisionItem[]; readonly now: Date }) {
  if (items.length === 0) {
    return (
      <Panel aria-label="Decision needed">
        <EmptyState icon={ListChecks} title="No lead is waiting for your answer">
          After a meeting is held, the lead waits here for you to accept or reject it.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel aria-label="Decision needed">
      <p className="px-5 pt-4 pb-1 text-body text-ink-muted">Answer with a note. A lead with no answer is accepted on its own after 48 hours.</p>
      <ul className="flex flex-col px-2.5 pb-3">
        {items.map((item) => {
          const countdown = autoAcceptCountdown(item.outcomeRecordedAt, now);
          return (
            <li key={item.id} className="relative flex flex-col gap-3 rounded-md px-3 py-4 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
              <div className="min-w-0">
                <Person name={item.prospectName} href={`/client/leads/${item.publicRef}`} sub={item.prospectCompany} />
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
                  <span className="font-mono">{item.publicRef}</span> in {item.campaignName}
                  {isClosed(item.campaignStatus) ? <ClosedTag /> : null}
                  {item.meetingTime !== null ? (
                    <>
                      , met <When at={item.meetingTime} style="day" />
                    </>
                  ) : null}
                </p>
                <p className={cn("mt-1 text-label font-semibold", countdown.urgent ? "text-amber-text" : "text-ink-2")}>{countdown.label}</p>
              </div>
              <div className="relative flex flex-wrap items-center gap-2">
                <FormSheet
                  trigger={
                    <Button type="button" variant="ghost-destructive">
                      <X aria-hidden weight="bold" />
                      Reject
                    </Button>
                  }
                  title="Reject this lead"
                  description={`Reject ${item.prospectName} and count it as zero.`}
                >
                  <DecideLeadForm leadId={item.id} decision="reject" />
                </FormSheet>
                <FormSheet
                  trigger={
                    <Button type="button" variant="default">
                      <Check aria-hidden weight="bold" />
                      Accept
                    </Button>
                  }
                  title="Accept this lead"
                  description={`Accept ${item.prospectName} and count it as one.`}
                >
                  <DecideLeadForm leadId={item.id} decision="accept" />
                </FormSheet>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
