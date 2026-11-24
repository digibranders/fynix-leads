import { auditSentence } from "@/lib/fynix/audit-text";
import { LEAD_STAGES, leadStageLabel, type LeadStage } from "@/lib/leads/stage";

const isStage = (value: string | null): value is LeadStage => value !== null && (LEAD_STAGES as readonly string[]).includes(value);
const stageWord = (value: string | null): string | null => (value === null ? null : isStage(value) ? leadStageLabel(value) : value);

/** One line of a campaign's Activity tab, in plain words: what happened, and the detail under it (the stage change and the note). */
export function activityLine(row: { readonly source: "audit" | "lead"; readonly action: string; readonly leadRef: string | null; readonly fromStage: string | null; readonly toStage: string | null; readonly note: string | null }): { readonly title: string; readonly detail: string | null } {
  if (row.source === "audit") return { title: auditSentence(row.action), detail: null };
  const from = stageWord(row.fromStage);
  const to = stageWord(row.toStage);
  const move = to === null ? null : from === null || from === to ? `Now ${to}` : `${from} to ${to}`;
  const note = row.note === null || row.note.trim() === "" ? null : row.note.trim();
  return { title: `Lead ${row.leadRef ?? ""}: ${auditSentence(row.action)}`.trim(), detail: [move, note].filter((part) => part !== null).join(". ") || null };
}
