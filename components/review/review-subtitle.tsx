"use client";

import { usePendingCount } from "@/lib/review/use-pending-count";

/** The review page subtitle. It reads the live pending count, so it follows every decision, Undo and reset. */
export function ReviewSubtitle() {
  const waiting = usePendingCount();
  if (waiting === 0) return <>No leads waiting on your decision</>;
  return (
    <>
      {waiting} {waiting === 1 ? "lead" : "leads"} waiting on your decision, oldest first
    </>
  );
}
