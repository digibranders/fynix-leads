import { countedMonth, isCountedStage } from "@/lib/domain/counting-month";
import { monthInZone } from "@/lib/time/zones";

/** One lead an agency sent, with the time zone of its campaign, which decides the month it belongs to. */
export interface AgencyLeadFact {
  readonly stage: string;
  readonly meetingTime: Date | null;
  readonly submittedAt: Date;
  readonly timeZone: string;
}

export interface AgencyLeadTally {
  /** Leads sent this month (the month read in the campaign's zone). */
  readonly submittedThisMonth: number;
  /** Leads that count this month: the counting rule, and the month the meeting was held. */
  readonly acceptedThisMonth: number;
  /** Leads that count, in any month. */
  readonly delivered: number;
}

/** The counting rule is `isCountedStage` and `countedMonth` (lib/domain/counting-month.ts); this only applies it to "this month". */
export function tallyAgencyLeads(facts: readonly AgencyLeadFact[], now: Date): AgencyLeadTally {
  let submittedThisMonth = 0;
  let acceptedThisMonth = 0;
  let delivered = 0;
  for (const fact of facts) {
    const thisMonth = monthInZone(now, fact.timeZone);
    if (monthInZone(fact.submittedAt, fact.timeZone) === thisMonth) submittedThisMonth += 1;
    if (!isCountedStage(fact.stage) || fact.meetingTime === null) continue;
    delivered += 1;
    if (countedMonth(fact.meetingTime, fact.timeZone) === thisMonth) acceptedThisMonth += 1;
  }
  return { submittedThisMonth, acceptedThisMonth, delivered };
}
