"use client";

import { CheckCircle, CircleNotch, Handshake, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { Facts } from "@/components/kit/facts";
import { Panel } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { Button } from "@/components/ui/button";
import { acceptAgreementAction, type AgreementActionResult } from "@/server/domain/agreement-actions";

export interface AgreementRow {
  readonly id: string;
  readonly campaignName: string;
  readonly clientBrandName: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly publishedOn: string;
  readonly acceptedOn: string | null;
}

const IDLE: AgreementActionResult = { status: "idle" };

function AcceptForm({ agreementId }: { readonly agreementId: string }) {
  const [state, action, pending] = useActionState(acceptAgreementAction, IDLE);
  return (
    <form noValidate action={action} className="flex flex-col items-start gap-2.5">
      <input type="hidden" name="agreementId" value={agreementId} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <CheckCircle aria-hidden weight="bold" />}
        Accept this version
      </Button>
      {state.status === "error" && state.message !== undefined ? (
        <p role="alert" className="flex w-full items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
          <WarningCircle aria-hidden size={18} weight="fill" className="mt-px shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}

/** The current agreement of each campaign: what was agreed, and the accept button for a manager who has not yet accepted it. */
export function AgreementsView({ agreements, canAccept, emptyText }: { readonly agreements: readonly AgreementRow[]; readonly canAccept: boolean; readonly emptyText: string }) {
  if (agreements.length === 0) {
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
      {agreements.map((row) => (
        <li key={row.id}>
          <Panel aria-label={row.campaignName} className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-name font-semibold tracking-title text-balance">{row.campaignName}</h2>
                <p className="mt-0.5 text-body text-ink-muted">
                  {row.clientBrandName}, version {row.version}, published {row.publishedOn}
                </p>
              </div>
              {row.acceptedOn === null ? <StatusChip kind="agreement" status="waiting" /> : <StatusChip kind="agreement" status="accepted" />}
            </div>

            <Facts
              className="sm:grid-cols-3"
              items={[
                ["Monthly target", `${row.monthlyTarget} meetings`],
                ["Total target", `${row.totalTarget} meetings`],
                ["Dispute window", `${row.disputeWindowHours} hours`],
              ]}
            />

            {row.rules.trim() !== "" ? (
              <div>
                <h3 className="text-label font-semibold text-ink">Rules</h3>
                <p className="mt-1 max-w-[72ch] text-body whitespace-pre-line text-ink-2">{row.rules}</p>
              </div>
            ) : null}

            <div className="pt-4 shadow-[inset_0_1px_0_var(--line)]">
              {row.acceptedOn !== null ? (
                <p className="flex items-center gap-2 text-body text-ink-2">
                  <CheckCircle aria-hidden size={18} weight="fill" className="text-green-solid" />
                  Accepted on {row.acceptedOn}.
                </p>
              ) : canAccept ? (
                <AcceptForm agreementId={row.id} />
              ) : (
                <p className="text-body text-ink-2">A manager of your organisation accepts agreements.</p>
              )}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
