const isCount = (n: number): boolean => Number.isFinite(n) && n > 0;

/** Month marks under the progress bar: every full month below the target (12, 24, ...). None for a target that is not a positive finite number. */
export function progressTicks(totalTarget: number, monthlyTarget: number): number[] {
  if (!isCount(totalTarget) || !isCount(monthlyTarget)) return [];
  return Array.from({ length: Math.ceil(totalTarget / monthlyTarget) - 1 }, (_, i) => (i + 1) * monthlyTarget);
}

/** How full a bar is, 0 to 100. A total that is not positive gives 0 rather than NaN or Infinity. */
export function barPercent(value: number, total: number): number {
  if (!isCount(total)) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

/** A whole, non-negative number of pills, safe to pass to `Array.from` and to a grid template. */
export function pillCount(target: number): number {
  return isCount(target) ? Math.floor(target) : 0;
}
