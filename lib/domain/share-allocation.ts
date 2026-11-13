export interface ShareSummary {
  /** The sum of the campaign's shares. */
  readonly totalShares: number;
  /** The monthly target of the campaign's current supplier agreement, or `null` when there is none. */
  readonly supplierMonthlyTarget: number | null;
  /** True when the shares add up to more than the supplier's target. Allowed, and shown to the person who sets the shares. */
  readonly overAllocated: boolean;
}

export function summariseShares(supplierMonthlyTarget: number | null, shares: readonly number[]): ShareSummary {
  const totalShares = shares.reduce((sum, share) => sum + share, 0);
  return { totalShares, supplierMonthlyTarget, overAllocated: supplierMonthlyTarget !== null && totalShares > supplierMonthlyTarget };
}
