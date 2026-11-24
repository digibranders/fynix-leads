/** The meetings an overview lists: booked, still to come, on an active campaign, soonest first. */
export interface UpcomingCandidate {
  readonly campaignId?: string;
  readonly outcome: string;
  readonly scheduledStartTime: Date | string;
}

export function upcomingMeetings<T extends UpcomingCandidate>(meetings: readonly T[], activeCampaignIds: ReadonlySet<string>, now: Date, limit = 4): readonly T[] {
  return meetings
    .filter((meeting) => meeting.outcome === "scheduled" && new Date(meeting.scheduledStartTime).getTime() > now.getTime() && (meeting.campaignId === undefined || activeCampaignIds.has(meeting.campaignId)))
    .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())
    .slice(0, limit);
}
