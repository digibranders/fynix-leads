/** "5h" under two days, "3d" from then on. For how long a lead has waited or an outcome has been overdue. */
export function ageText(hours: number): string {
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** "4 of 8" against a target, or the bare count when there is no target. */
export function deliveredText(delivered: number, target: number): string {
  return target > 0 ? `${delivered} of ${target}` : String(delivered);
}
