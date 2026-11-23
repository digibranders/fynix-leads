"use client";

import { CheckCircle, CircleNotch, Clock, Handshake, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
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
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="agreementId" value={agreementId} />
      <div>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <CircleNotch aria-hidden className="animate-spin" /> : <CheckCircle aria-hidden />}
          Accept this version
        </Button>
      </div>
      {state.status === "error" && state.message !== undefined ? (
        <p role="alert" className="flex items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
          <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
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
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-8 text-center shadow-raised">
        <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><Handshake aria-hidden size={20} /></span>
        <p className="text-row font-semibold text-ink">No agreement published yet</p>
        <p className="max-w-[44ch] text-table text-ink-2">{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {agreements.map((row) => (
        <li key={row.id} className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-value font-semibold text-ink">{row.campaignName}</h2>
              <p className="text-table text-ink-2">{row.clientBrandName}, version {row.version}, published {row.publishedOn}</p>
            </div>
            {row.acceptedOn === null ? (
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-amber-soft px-2.5 text-label font-semibold text-amber-text"><Clock aria-hidden size={14} />Not accepted yet</span>
            ) : (
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-green-soft px-2.5 text-label font-semibold text-green-text"><CheckCircle aria-hidden size={14} />Accepted {row.acceptedOn}</span>
            )}
          </div>
          <dl className="grid gap-3 rounded-md bg-navy-04 p-4 text-table sm:grid-cols-3">
            <div><dt className="text-ink-muted">Monthly target</dt><dd className="text-value font-semibold text-ink">{row.monthlyTarget} meetings</dd></div>
            <div><dt className="text-ink-muted">Total target</dt><dd className="text-value font-semibold text-ink">{row.totalTarget} meetings</dd></div>
            <div><dt className="text-ink-muted">Dispute window</dt><dd className="text-value font-semibold text-ink">{row.disputeWindowHours} hours</dd></div>
          </dl>
          {row.rules.trim() !== "" ? (
            <div>
              <p className="text-label font-semibold text-ink">Rules</p>
              <p className="mt-1 whitespace-pre-line text-table text-ink-2">{row.rules}</p>
            </div>
          ) : null}
          {row.acceptedOn === null && canAccept ? <AcceptForm agreementId={row.id} /> : null}
          {row.acceptedOn === null && !canAccept ? <p className="text-table text-ink-2">A manager of your organisation accepts agreements.</p> : null}
        </li>
      ))}
    </ul>
  );
}
