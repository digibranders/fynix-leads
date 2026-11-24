import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import type { MeetProvider } from "@/server/meet/provider";
import { enqueueLeadEmails, type EnqueueOptions } from "@/server/mail/lead-emails";

/**
 * The time-based half of the launch emails and the join record, run by `pnpm leads:sweep` as `leads_auth`. Every step is idempotent: a row is claimed and
 * stamped by a database function in the same transaction that writes its emails, so a second run, or a run that failed half way, never sends a message twice and
 * never loses one. Each step is its own transaction, so one failing does not undo the others. Which steps run is the caller's choice (the script runs the
 * email steps only while LAUNCH_EMAILS_ENABLED is true); none of them is a domain function, because none acts for a person.
 */
export interface SweepEmailResult {
  readonly autoAccepted: readonly { readonly id: string; readonly publicRef: string }[];
  readonly decisionReminders: number;
  readonly prospectReminders: number;
  readonly nudges: number;
}

/**
 * Accepts the leads the client left unanswered for 48 hours (`app_sweep_leads`, the same function as `sweepLeads`) and, in the same transaction, queues the
 * email of each acceptance. With `enqueue.enabled` false nothing is queued and this is exactly `sweepLeads`.
 */
export async function sweepLeadsWithEmails(authDb: Database, now: Date, enqueue: EnqueueOptions): Promise<readonly { readonly id: string; readonly publicRef: string }[]> {
  return authDb.transaction(async (tx) => {
    const swept = await tx.execute<{ swept_id: string; swept_ref: string }>(sql`select swept_id, swept_ref from public.app_sweep_leads(${now.toISOString()}::timestamptz)`);
    const rows = swept.rows.map((row) => ({ id: row.swept_id, publicRef: row.swept_ref }));
    for (const row of rows) await enqueueLeadEmails(tx, { type: "lead_auto_accepted", leadId: row.id }, { ...enqueue, system: true });
    return rows;
  });
}

/** The email half of the client's reminders (12, 24 and 36 hours after the outcome), with its own stamp so the notice in the app is unaffected. */
export async function sendReminderEmails(authDb: Database, now: Date, enqueue: EnqueueOptions): Promise<number> {
  return authDb.transaction(async (tx) => {
    const due = await tx.execute<{ lead_id: string; kind: string; hours_left: number }>(sql`select lead_id, kind, hours_left from public.app_claim_reminder_emails(${now.toISOString()}::timestamptz)`);
    for (const row of due.rows) await enqueueLeadEmails(tx, { type: "decision_reminder", hoursLeft: row.hours_left, leadId: row.lead_id }, { ...enqueue, system: true });
    return due.rows.length;
  });
}

/** The prospect's reminders a day and an hour before the meeting, and the nudges to record the outcome when it ends and a day later. */
export async function sendMeetingReminderEmails(authDb: Database, now: Date, enqueue: EnqueueOptions): Promise<{ readonly prospect: number; readonly nudges: number }> {
  return authDb.transaction(async (tx) => {
    const due = await tx.execute<{ meeting_id: string; lead_id: string; kind: string }>(sql`select meeting_id, lead_id, kind from public.app_claim_meeting_reminders(${now.toISOString()}::timestamptz)`);
    let prospect = 0;
    let nudges = 0;
    for (const row of due.rows) {
      const options = { ...enqueue, system: true };
      if (row.kind === "prospect_24h" || row.kind === "prospect_1h") {
        prospect += 1;
        await enqueueLeadEmails(tx, { type: "prospect_reminder", kind: row.kind === "prospect_24h" ? "24h" : "1h", leadId: row.lead_id }, options);
      } else {
        nudges += 1;
        await enqueueLeadEmails(tx, { type: "outcome_nudge", leadId: row.lead_id }, options);
      }
    }
    return { prospect, nudges };
  });
}

/**
 * Reads who joined each room that ended 30 minutes ago or more and stores name, join time and length (`app_store_meeting_joins`, which also stamps the meeting so
 * it is read once). A room that cannot be read is left alone and tried again at the next run: the stamp is written only after a successful read. Returns how many
 * meetings were imported. Needs no email switch, only a provider with rooms.
 */
export async function importJoinRecords(authDb: Database, provider: MeetProvider, now: Date): Promise<number> {
  const due = await authDb.execute<{ meeting_id: string; space_id: string }>(sql`select meeting_id, space_id from public.app_meetings_for_join_import(${now.toISOString()}::timestamptz)`);
  let imported = 0;
  for (const row of due.rows) {
    let entries;
    try {
      entries = await provider.readJoinRecord(row.space_id);
    } catch {
      continue;
    }
    const joins = JSON.stringify(
      entries.map((entry) => ({ displayName: entry.displayName, joinedAt: entry.joinedAt.toISOString(), leftAt: entry.leftAt?.toISOString() ?? "", durationSeconds: entry.durationSeconds })),
    );
    await authDb.execute(sql`select public.app_store_meeting_joins(${row.meeting_id}::uuid, ${joins}::jsonb, ${now.toISOString()}::timestamptz)`);
    imported += 1;
  }
  return imported;
}
