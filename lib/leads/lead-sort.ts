import { leadStageLabel, type LeadStage } from "./stage";
import type { SortKey } from "./sort";

interface SortableLead {
  readonly stage: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly submittedAt: Date | string;
  readonly scheduledMeetingTime: Date | string | null;
}

const time = (value: Date | string): number => new Date(value).getTime();

/** What each sortable column of a leads table reads from a row. A lead with no meeting sorts last either way. */
export const LEAD_SORT_CELLS: Readonly<Record<SortKey, (row: SortableLead) => string | number | null>> = {
  stage: (row) => leadStageLabel(row.stage as LeadStage),
  prospect: (row) => row.prospectName,
  company: (row) => row.prospectCompany,
  submitted: (row) => time(row.submittedAt),
  meeting: (row) => (row.scheduledMeetingTime === null ? null : time(row.scheduledMeetingTime)),
};
