import { sql } from "drizzle-orm";
import type { DomainDeps } from "@/server/domain/deps";

export { AUTO_ACCEPT_HOURS } from "@/lib/leads/decision-queue";

export interface SweptLead {
  readonly id: string;
  readonly publicRef: string;
}

/** A reminder to the client that is due and not yet sent: its lead is still waiting for an answer. */
export interface DueReminder {
  readonly reminderId: string;
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignId: string;
  readonly kind: "12h" | "24h" | "36h";
  readonly dueAt: Date;
  /** Whole hours left before the automatic acceptance, for the "x hours left" the reminder states. */
  readonly hoursLeft: number;
}

/**
 * Accepts every lead that has waited 48 hours or more for the client since its outcome was recorded (`awaiting_decision`), with the decision
 * source `auto` and the note "Accepted automatically after 48 hours with no answer". One database statement as `leads_auth`
 * (`app_sweep_leads`, migration 0066): atomic, time-based and independent of email or any session, and a second run finds nothing, because an
 * accepted lead is no longer awaiting a decision. `pnpm leads:sweep` runs it every five minutes.
 */
export async function sweepLeads(deps: Pick<DomainDeps, "authDb">, now: Date): Promise<readonly SweptLead[]> {
  const result = await deps.authDb.execute<{ swept_id: string; swept_ref: string }>(sql`select swept_id, swept_ref from public.app_sweep_leads(${now.toISOString()}::timestamptz)`);
  return result.rows.map((row) => ({ id: row.swept_id, publicRef: row.swept_ref }));
}

/** A reminder that was turned into notices: how many people of the client were told. */
export interface SentReminder extends Omit<DueReminder, "dueAt"> {
  readonly notified: number;
}

/**
 * Turns the reminders that are due at `now` into notices in the app (`app_send_lead_reminders`, migration 0071): one to every active person of the
 * client of the campaign, stating the hours left before the automatic acceptance. Each reminder is stamped sent in the same database call that writes the
 * notices, so a second run writes nothing, and a lead the client has answered is never reminded. When several are due at once only the latest becomes a
 * notice. Because it stamps `sent_at`, `dueReminders` no longer lists these reminders afterwards: the email half (phase 6) needs its own stamp, or to
 * send in the same call. Runs as `leads_auth` from `pnpm leads:sweep`, after `sweepLeads`.
 */
export async function sendLeadReminders(deps: Pick<DomainDeps, "authDb">, now: Date): Promise<readonly SentReminder[]> {
  const result = await deps.authDb.execute<{ reminder_id: string; lead_id: string; lead_ref: string; campaign_id: string; kind: DueReminder["kind"]; hours_left: number; notified: number }>(
    sql`select reminder_id, lead_id, lead_ref, campaign_id, kind, hours_left, notified from public.app_send_lead_reminders(${now.toISOString()}::timestamptz)`,
  );
  return result.rows.map((row) => ({ reminderId: row.reminder_id, leadId: row.lead_id, leadRef: row.lead_ref, campaignId: row.campaign_id, kind: row.kind, hoursLeft: row.hours_left, notified: row.notified }));
}

/**
 * The reminders that are due at `now`: 12, 24 and 36 hours after the outcome, for a lead still waiting for the client and not yet stamped sent. A read
 * only list; the notices in the app are written by `sendLeadReminders`, and the email (phase 6) will read this list.
 */
export async function dueReminders(deps: Pick<DomainDeps, "authDb">, now: Date): Promise<readonly DueReminder[]> {
  const result = await deps.authDb.execute<{ reminder_id: string; lead_id: string; lead_ref: string; campaign_id: string; kind: DueReminder["kind"]; due_at: Date | string; hours_left: number }>(
    sql`select reminder_id, lead_id, lead_ref, campaign_id, kind, due_at, hours_left from public.app_due_lead_reminders(${now.toISOString()}::timestamptz)`,
  );
  return result.rows.map((row) => ({ reminderId: row.reminder_id, leadId: row.lead_id, leadRef: row.lead_ref, campaignId: row.campaign_id, kind: row.kind, dueAt: new Date(row.due_at), hoursLeft: row.hours_left }));
}
