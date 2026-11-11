import { countingMonth } from "@/lib/domain/counting-month";
import type { Lead } from "@/lib/domain/types";
import { lastMessageSide } from "@/lib/leads/thread";
import { isOverdue } from "@/lib/time/age";

export type CampaignStats = {
  deliveredThisMonth: number;
  deliveredToDate: number;
  awaitingClientDecision: number;
  overdueAwaitingDecision: number;
  clarificationsToAnswer: number;
  replacementsOwed: number;
};

/** Rejected leads that no other lead replaces, in input order. */
export function replacementsOwedRefs(leads: readonly Pick<Lead, "ref" | "approval" | "replacesRef">[]): string[] {
  const replaced = new Set(leads.flatMap((l) => (l.replacesRef ? [l.replacesRef] : [])));
  return leads.filter((l) => l.approval === "rejected" && !replaced.has(l.ref)).map((l) => l.ref);
}

/** Counts for the agency overview. Compute on the server from the full leads and pass the plain numbers down. */
export function campaignStats(leads: readonly Lead[], now: Date): CampaignStats {
  const thisMonth = now.toISOString().slice(0, 7);
  const months = leads.map(countingMonth);
  const pending = leads.filter((l) => l.approval === "pending");

  return {
    deliveredThisMonth: months.filter((m) => m === thisMonth).length,
    deliveredToDate: months.filter((m) => m !== null).length,
    awaitingClientDecision: pending.length,
    overdueAwaitingDecision: pending.filter((l) => isOverdue(new Date(l.submittedAt), now)).length,
    clarificationsToAnswer: leads.filter((l) => l.approval === "needs_clarification" && lastMessageSide(l.thread) === "client").length,
    replacementsOwed: replacementsOwedRefs(leads).length,
  };
}
