/** How long a person stayed in the room, in words a person reads on a phone: "Under a minute", "1 minute", "23 minutes". */
export function stayText(durationSeconds: number): string {
  const minutes = Math.round(durationSeconds / 60);
  if (minutes < 1) return "Under a minute";
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Whether the "Who joined" block is shown: only for a meeting that has started and was not cancelled. Before then there is nothing to say. */
export function showsJoinBlock(meeting: { readonly scheduledStartTime: Date | string; readonly outcome: string } | null, now: Date): boolean {
  return meeting !== null && meeting.outcome !== "cancelled" && new Date(meeting.scheduledStartTime).getTime() <= now.getTime();
}
