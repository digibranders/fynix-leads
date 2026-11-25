import { createDatabase } from "@/server/db/pool";
import { sendLeadReminders } from "@/server/domain/lead-sweep";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { importJoinRecords, sendMeetingReminderEmails, sendReminderEmails, sendWaitingReminders, sweepLeadsWithEmails } from "@/server/mail/launch-sweep";
import { launchEmailsEnabled } from "@/server/mail/launch";
import { meetProviderFromEnv } from "@/server/meet";
import { runScript } from "@/server/run-script";

// Runs the lead sweep once, as the leads_auth role: accepts every lead the client left unanswered for 48 hours after the meeting, and writes the
// reminders that are due as notices in the app, among them the daily one to a client with a lead still waiting for a time (once a day, from 9 am there) and
// the notice of a target an automatic acceptance has just completed. It reads the clock and the database and nothing else, so it works with email off. A systemd timer runs it every five
// minutes (docs/ops/leads-sweep.timer); running it again changes nothing.
//
// Phase 6 adds, behind switches that are off by default:
// - LAUNCH_EMAILS_ENABLED=true: the emails of an automatic acceptance, the email half of the client's reminders (its own stamp, so the notices above are
//   unaffected), the prospect's reminders a day and an hour before a meeting, and the nudges to record an outcome.
// - MEET_PROVIDER=google: the join record of every room that ended 30 minutes ago or more, read once.
runScript(async () => {
  loadEnvLocal();
  const env = getEnv();
  const auth = createDatabase(env.DATABASE_URL_AUTH, { max: 1 });
  try {
    const now = new Date();
    const emails = launchEmailsEnabled();
    const enqueue = { enabled: emails, origin: env.APP_ORIGIN };
    const swept = await sweepLeadsWithEmails(auth.db, now, enqueue);
    const reminders = await sendLeadReminders({ authDb: auth.db }, now);
    const waiting = await sendWaitingReminders(auth.db, now, enqueue);
    console.log(`Lead sweep: ${swept.length} accepted automatically${swept.length === 0 ? "" : ` (${swept.map((row) => row.publicRef).join(", ")})`}, ${reminders.length} reminders sent as notices, ${waiting.clients} clients reminded of leads waiting for a time.`);
    if (emails) {
      const reminderEmails = await sendReminderEmails(auth.db, now, enqueue);
      const meeting = await sendMeetingReminderEmails(auth.db, now, enqueue);
      console.log(`Launch emails: ${reminderEmails} client reminders, ${meeting.prospect} prospect reminders, ${meeting.nudges} outcome nudges queued.`);
    }
    if (env.MEET_PROVIDER === "google") {
      const joins = await importJoinRecords(auth.db, meetProviderFromEnv(), now);
      console.log(`Join records: ${joins} meetings imported.`);
    }
  } finally {
    await auth.close();
  }
});
