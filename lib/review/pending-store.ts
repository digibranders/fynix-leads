import { SAMPLE_LEADS } from "@/lib/sample/data";
import { reviewQueue } from "./queue";

// A tiny external store for the number of leads waiting on a decision, read with useSyncExternalStore.
// The review queue writes it, and the rail badge and the page subtitle read it, so they stay in step.
const INITIAL = reviewQueue(SAMPLE_LEADS).length;

let count = INITIAL;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSnapshot = (): number => count;
export const getServerSnapshot = (): number => INITIAL;

export function setPendingCount(next: number): void {
  if (!Number.isInteger(next) || next < 0) {
    throw new RangeError(`The pending count must be a non-negative integer, got ${next}.`);
  }
  if (next === count) return;
  count = next;
  listeners.forEach((listener) => listener());
}

export const resetPendingCount = (): void => setPendingCount(INITIAL);
