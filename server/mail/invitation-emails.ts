import { sql } from "drizzle-orm";
import { formatMeetingTime, parseLaunchContent } from "@/lib/email/launch-templates";
import { renderEmail } from "@/lib/email/templates";
import { launchEmailsEnabled } from "@/server/mail/launch";
import type { EmailExecutor, EnqueueOptions } from "@/server/mail/lead-emails";

type ContextRow = { lead_ref: string; company: string; campaign_name: string; starts_at: Date | string; reply_due_at: Date | string | null; time_zone: string };

/**
 * Queues one invitation email for each person invited to a meeting, inside the booking's own transaction (the outbox pattern), so the emails and the booking
 * commit together. Each carries its own link to the reply page, made from the token the booking just generated; the database checks every token against the hash
 * stored for that person before it writes the message, so it cannot write one for someone who was not invited. The time is written out in the campaign's zone.
 * Does nothing while `LAUNCH_EMAILS_ENABLED` is not `true`.
 */
export async function enqueueInvitationEmails(
  db: EmailExecutor,
  input: { readonly meetingId: string; readonly invitations: readonly { readonly memberId: string; readonly token: string }[] },
  options: EnqueueOptions = {},
): Promise<number> {
  if (input.invitations.length === 0 || !(options.enabled ?? launchEmailsEnabled())) return 0;
  const origin = options.origin ?? process.env.APP_ORIGIN;
  if (origin === undefined || origin === "") throw new Error("APP_ORIGIN must be set to queue the launch emails.");
  const found = await db.execute<ContextRow>(sql`select lead_ref, company, campaign_name, starts_at, reply_due_at, time_zone from public.app_invitation_email_context(${input.meetingId}::uuid)`);
  const row = found.rows[0];
  if (row === undefined || row.reply_due_at === null) return 0;
  const content = parseLaunchContent("meeting_invitation", {
    ref: row.lead_ref,
    company: row.company,
    campaignName: row.campaign_name,
    when: formatMeetingTime(new Date(row.starts_at), row.time_zone),
    replyBy: formatMeetingTime(new Date(row.reply_due_at), row.time_zone),
  });
  const stored = renderEmail(content, null);
  const members = `{${input.invitations.map((item) => item.memberId).join(",")}}`;
  const tokens = `{${input.invitations.map((item) => item.token).join(",")}}`;
  const written = await db.execute<{ n: number }>(
    sql`select public.app_enqueue_invitation_emails(${input.meetingId}::uuid, ${members}::uuid[], ${tokens}::text[], ${JSON.stringify(content.params)}::jsonb, ${stored.subject}, ${stored.text}, ${origin}) as n`,
  );
  return written.rows[0]?.n ?? 0;
}
