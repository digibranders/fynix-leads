export interface ShareSummary {
  /** The sum of the campaign's shares. */
  readonly totalShares: number;
  /** The campaign's one monthly number (set by the agreement both sides accepted). `null` only for a caller with no number to give. */
  readonly campaignMonthlyTarget: number | null;
  /** True when the shares add up to more than the campaign's number. Allowed, and shown to the person who sets the shares. */
  readonly overAllocated: boolean;
}

export function summariseShares(campaignMonthlyTarget: number | null, shares: readonly number[]): ShareSummary {
  const totalShares = shares.reduce((sum, share) => sum + share, 0);
  return { totalShares, campaignMonthlyTarget, overAllocated: campaignMonthlyTarget !== null && totalShares > campaignMonthlyTarget };
}
