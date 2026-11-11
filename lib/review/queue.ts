import type { Lead } from "@/lib/domain/types";

export type Removal<T> = { items: T[]; nextRef: string | null; index: number };

/** Remove the item with this ref. nextRef is the item that moves into its place, else the previous one, else null. */
export function removeByRef<T extends { ref: string }>(items: readonly T[], ref: string): Removal<T> {
  const index = items.findIndex((item) => item.ref === ref);
  if (index === -1) return { items: [...items], nextRef: null, index: -1 };
  const remaining = items.filter((_, i) => i !== index);
  const neighbour = remaining[index] ?? remaining[index - 1];
  return { items: remaining, nextRef: neighbour?.ref ?? null, index };
}

/** The review queue: pending leads only, oldest submission first. */
export function reviewQueue(leads: readonly Lead[]): Lead[] {
  return leads
    .filter((lead) => lead.approval === "pending")
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

export type QueueSegments = { waiting: Lead[]; clarifying: Lead[]; decided: Lead[] };

const bySubmitted = (a: Lead, b: Lead) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
// A decided lead without a decision sorts last rather than breaking the list.
const decidedTime = (lead: Lead) => (lead.decision ? Date.parse(lead.decision.decidedAt) : Number.NEGATIVE_INFINITY);

/** The three review segments. Waiting and clarifying are oldest submission first; decided is newest decision first. Drafts appear nowhere. */
export function queueSegments(leads: readonly Lead[]): QueueSegments {
  return {
    waiting: leads.filter((l) => l.approval === "pending").sort(bySubmitted),
    clarifying: leads.filter((l) => l.approval === "needs_clarification").sort(bySubmitted),
    decided: leads
      .filter((l) => l.approval === "approved" || l.approval === "rejected")
      .sort((a, b) => decidedTime(b) - decidedTime(a)),
  };
}
