import { countingMonth } from "@/lib/domain/counting-month";
import type { Lead } from "@/lib/domain/types";
import { lastMessageSide } from "@/lib/leads/thread";
import { isOverdue } from "@/lib/time/age";
import { monthInZone } from "@/lib/time/zones";

export type CampaignStats = {
  deliveredThisMonth: number;
  deliveredToDate: number;
  awaitingClientDecision: number;
  overdueAwaitingDecision: number;
  clarificationsToAnswer: number;
  replacementsOwed: number;
};

/** Rejected leads that no other lead replaces, in input order. A draft replacement does not count: the debt stands until the agency submits it. */
export function replacementsOwedRefs(leads: readonly Pick<Lead, "ref" | "approval" | "replacesRef">[]): string[] {
  const replaced = new Set(leads.flatMap((l) => (l.replacesRef && l.approval !== "draft" ? [l.replacesRef] : [])));
  return leads.filter((l) => l.approval === "rejected" && !replaced.has(l.ref)).map((l) => l.ref);
}

/** Counts for the agency overview. Compute on the server from the full leads and pass the plain numbers down. Months are read in `zone`, the campaign time zone. */
export function campaignStats(leads: readonly Lead[], now: Date, zone: string): CampaignStats {
  const thisMonth = monthInZone(now, zone);
  const months = leads.map((l) => countingMonth(l, zone));
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
