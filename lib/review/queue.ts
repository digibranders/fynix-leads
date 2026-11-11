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

/** Put an item back at an index (clamped to the list length). Does not mutate the input. */
export function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  const at = Math.min(Math.max(index, 0), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** The review queue: pending leads only, oldest submission first. */
export function reviewQueue(leads: readonly Lead[]): Lead[] {
  return leads
    .filter((lead) => lead.approval === "pending")
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}
