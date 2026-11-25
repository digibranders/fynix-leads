import { sql } from "drizzle-orm";
import { parseLaunchContent, isProspectTemplate } from "@/lib/email/launch-templates";
import { renderEmail } from "@/lib/email/templates";
import { campaignEmailDeliveries, leadEmailDeliveries, type LeadEmailContext, type LeadEmailEvent } from "@/lib/leads/lead-emails";
import type { CampaignNoticeEvent } from "@/lib/leads/notices";
import type { Database } from "@/server/db/pool";
import { hasNeutralSender, launchEmailsEnabled } from "@/server/mail/launch";

/**
 * Queues the launch emails of a lead event (phase 6): who gets which email is `lib/leads/lead-emails.ts`; the people, the person who acted and what only the
 * database may read are the database functions of migration 0075. Called by `notify()` after the notices, inside the same transaction as the change itself,
 * so the emails and the change commit together or not at all (the outbox pattern). Does nothing, and touches nothing, while `LAUNCH_EMAILS_ENABLED` is not `true`.
 */
export type EmailExecutor = Pick<Database, "execute">;

export interface EnqueueOptions {
  /** Overrides the environment, for a test or a script that already read it. */
  readonly enabled?: boolean;
  readonly origin?: string;
  readonly neutralSender?: boolean;
  /** True from the sweep, which has no person who acted and runs as `leads_auth`. */
  readonly system?: boolean;
}

/** A Postgres text[] literal. The words are fixed audiences, never input. */
const textArray = (values: readonly string[]): string => `{${values.join(",")}}`;

type ContextRow = {
  lead_ref: string;
  company: string;
  time_zone: string;
  meeting_id: string | null;
  meeting_ref: string | null;
  starts_at: Date | string | null;
  duration_minutes: number | null;
  meet_url: string | null;
  ics_sequence: number | null;
  meeting_outcome: string | null;
  prospect_ready: boolean;
};

export async function readLeadEmailContext(db: EmailExecutor, leadId: string, system: boolean): Promise<LeadEmailContext | null> {
  const result = system
    ? await db.execute<ContextRow>(sql`select * from public.app_lead_email_context_system(${leadId}::uuid)`)
    : await db.execute<ContextRow>(sql`select * from public.app_lead_email_context(${leadId}::uuid)`);
  const row = result.rows[0];
  if (row === undefined) return null;
  const hasMeeting = row.meeting_ref !== null && row.starts_at !== null && row.duration_minutes !== null && row.ics_sequence !== null && row.meeting_outcome !== null;
  return {
    ref: row.lead_ref,
    company: row.company,
    timeZone: row.time_zone,
    prospectReady: row.prospect_ready,
    meeting: hasMeeting
      ? { ref: row.meeting_ref as string, startsAt: new Date(row.starts_at as Date | string), durationMinutes: row.duration_minutes as number, meetUrl: row.meet_url, icsSequence: row.ics_sequence as number, outcome: row.meeting_outcome as string }
      : null,
  };
}

/** Queues the emails of one lead event. Returns how many messages were written. */
export async function enqueueLeadEmails(db: EmailExecutor, event: LeadEmailEvent & { readonly leadId: string }, options: EnqueueOptions = {}): Promise<number> {
  if (!(options.enabled ?? launchEmailsEnabled())) return 0;
  const origin = options.origin ?? process.env.APP_ORIGIN;
  if (origin === undefined || origin === "") throw new Error("APP_ORIGIN must be set to queue the launch emails.");
  const system = options.system === true;
  const { leadId, ...rest } = event;
  const context = await readLeadEmailContext(db, leadId, system);
  if (context === null) return 0;
  const neutral = options.neutralSender ?? hasNeutralSender();
  // A prospect letter is never queued without a neutral sender: the sender refuses it too, but a message that cannot go should not wait in the table.
  const deliveries = leadEmailDeliveries(rest as LeadEmailEvent, context).filter((delivery) => neutral || !isProspectTemplate(delivery.template));
  let written = 0;
  for (const delivery of deliveries) {
    // Read back through the template's own parser, so a bad param stops here with the change and not at the sender, hours later (a prospect letter's own fields are added by the database).
    const content = parseLaunchContent(delivery.template, delivery.params, { beforeDatabase: true });
    const prospect = isProspectTemplate(delivery.template);
    // The stored copy is the record of what was queued. A prospect letter's text is built at send time, because the brand, the signer and the privacy link are added by the database.
    const stored = prospect ? { subject: "Your meeting", text: "A letter to the prospect. Its text is built when it is sent." } : renderEmail(content, null);
    const audience = textArray(delivery.audience);
    const params = JSON.stringify(content.params);
    const result = system
      ? await db.execute<{ n: number }>(sql`select public.app_enqueue_lead_email_system(${leadId}::uuid, ${audience}::text[], ${delivery.template}, ${params}::jsonb, ${stored.subject}, ${stored.text}, ${origin}) as n`)
      : await db.execute<{ n: number }>(sql`select public.app_enqueue_lead_email(${leadId}::uuid, ${audience}::text[], ${delivery.template}, ${params}::jsonb, ${stored.subject}, ${stored.text}, ${origin}) as n`);
    written += result.rows[0]?.n ?? 0;
  }
  return written;
}

type TargetRow = { scope: "campaign_month" | "campaign_total" | "agency_share"; campaign_name: string; period: string; reached: number; target: number };

/**
 * After a lead's count changed: asks the database which targets the lead has just completed (`app_claim_target_notices`, which stamps each one so it is said
 * once and writes its notice in the app) and queues the email of each. The claim runs whatever the email switch says, because the notices are not behind it;
 * the emails are. `system` is the sweep, after an automatic acceptance. Returns how many targets were claimed.
 */
export async function claimTargetNotices(db: EmailExecutor, leadId: string, options: EnqueueOptions = {}): Promise<number> {
  const claimed =
    options.system === true
      ? await db.execute<TargetRow>(sql`select scope, campaign_name, period, reached, target from public.app_claim_target_notices_system(${leadId}::uuid)`)
      : await db.execute<TargetRow>(sql`select scope, campaign_name, period, reached, target from public.app_claim_target_notices(${leadId}::uuid)`);
  for (const row of claimed.rows) {
    await enqueueLeadEmails(db, { type: "target_met", scope: row.scope, campaignName: row.campaign_name, period: row.period, reached: row.reached, target: row.target, leadId }, options);
  }
  return claimed.rows.length;
}

/**
 * Queues the email of a campaign event: only a new agreement version has one, to the managers of both sides (`lib/leads/lead-emails.ts`). Only Fynix publishes
 * an agreement, and the database function refuses anyone else. Does nothing while `LAUNCH_EMAILS_ENABLED` is not `true`.
 */
export async function enqueueCampaignEmails(db: EmailExecutor, event: CampaignNoticeEvent & { readonly campaignId: string }, options: EnqueueOptions = {}): Promise<number> {
  if (event.type !== "agreement_published") return 0;
  if (!(options.enabled ?? launchEmailsEnabled())) return 0;
  const origin = options.origin ?? process.env.APP_ORIGIN;
  if (origin === undefined || origin === "") throw new Error("APP_ORIGIN must be set to queue the launch emails.");
  const { campaignId, ...rest } = event;
  const named = await db.execute<{ name: string }>(sql`select name from public.campaign where id = ${campaignId}::uuid`);
  const campaignName = named.rows[0]?.name;
  if (campaignName === undefined) return 0;
  let written = 0;
  for (const delivery of campaignEmailDeliveries(rest, { campaignName })) {
    const content = parseLaunchContent(delivery.template, delivery.params);
    const stored = renderEmail(content, null);
    const result = await db.execute<{ n: number }>(
      sql`select public.app_enqueue_campaign_email(${campaignId}::uuid, ${textArray(delivery.audience)}::text[], ${delivery.template}, ${JSON.stringify(content.params)}::jsonb, ${stored.subject}, ${stored.text}, ${origin}) as n`,
    );
    written += result.rows[0]?.n ?? 0;
  }
  return written;
}
