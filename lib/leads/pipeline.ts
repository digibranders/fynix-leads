import { LEAD_STAGES, type LeadStage } from "./stage";

/**
 * The lead stages, read as eight groups a person can scan: who has to act, what is booked, what is done, what went wrong, what ended.
 * The stage bar, the tabs and the `?stage=` filter of every leads screen use these groups, so the counts always agree.
 */
export const PIPELINE_GROUPS = [
  { key: "awaiting", label: "Awaiting client", stages: ["awaiting_client"], color: "var(--amber-solid)" },
  { key: "scheduled", label: "Scheduled", stages: ["scheduled", "reschedule_needed"], color: "var(--blue-solid)" },
  { key: "due", label: "Outcome due", stages: ["outcome_due"], color: "var(--teal-solid)" },
  { key: "decision", label: "Awaiting decision", stages: ["held", "awaiting_decision"], color: "var(--teal-solid)" },
  // The key stays `delivered` so an old `?stage=delivered` link still works; the word is Accepted. A client no-show counts at once, so it sits here.
  { key: "delivered", label: "Accepted", stages: ["accepted", "delivered", "client_no_show"], color: "var(--green-solid)" },
  { key: "disputed", label: "Disputed", stages: ["disputed"], color: "var(--red-solid)" },
  { key: "rejected", label: "Rejected", stages: ["declined", "rejected"], color: "var(--red-solid)" },
  { key: "closed", label: "Closed", stages: ["withdrawn", "lost", "prospect_no_show", "draft"], color: "var(--ink-muted)" },
] as const satisfies readonly { key: string; label: string; stages: readonly LeadStage[]; color: string }[];

export type PipelineKey = (typeof PIPELINE_GROUPS)[number]["key"];

/** The group a stage belongs to. */
export function groupOf(stage: LeadStage): PipelineKey {
  for (const group of PIPELINE_GROUPS) {
    if ((group.stages as readonly LeadStage[]).includes(stage)) return group.key;
  }
  throw new Error(`Lead stage ${stage} is in no pipeline group`);
}

/** Reads a `?stage=` value: a known group key, or null for "all". Anything else is ignored rather than trusted. */
export function parseGroup(value: string | string[] | undefined): PipelineKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return PIPELINE_GROUPS.find((group) => group.key === raw)?.key ?? null;
}

/** How many leads sit in each group. Every group is present, with zero when empty. */
export function countByGroup(leads: readonly { readonly stage: string }[]): Record<PipelineKey, number> {
  const counts = Object.fromEntries(PIPELINE_GROUPS.map((group) => [group.key, 0])) as Record<PipelineKey, number>;
  for (const lead of leads) {
    if ((LEAD_STAGES as readonly string[]).includes(lead.stage)) counts[groupOf(lead.stage as LeadStage)] += 1;
  }
  return counts;
}

/** The leads of one group, or all of them for null. */
export function inGroup<T extends { readonly stage: string }>(leads: readonly T[], group: PipelineKey | null): T[] {
  if (group === null) return [...leads];
  return leads.filter((lead) => (LEAD_STAGES as readonly string[]).includes(lead.stage) && groupOf(lead.stage as LeadStage) === group);
}
