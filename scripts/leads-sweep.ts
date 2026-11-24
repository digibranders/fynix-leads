import { createDatabase } from "@/server/db/pool";
import { dueReminders, sweepLeads } from "@/server/domain/lead-sweep";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Runs the lead sweep once, as the leads_auth role: accepts every lead the client left unanswered for 48 hours after the meeting, and counts the
// reminders that are due. It reads the clock and the database and nothing else, so it works with email off. A systemd timer runs it every five
// minutes (docs/ops/leads-sweep.timer); running it again changes nothing.
runScript(async () => {
  loadEnvLocal();
  const env = getEnv();
  const auth = createDatabase(env.DATABASE_URL_AUTH, { max: 1 });
  try {
    const now = new Date();
    const swept = await sweepLeads({ authDb: auth.db }, now);
    const reminders = await dueReminders({ authDb: auth.db }, now);
    console.log(`Lead sweep: ${swept.length} accepted automatically${swept.length === 0 ? "" : ` (${swept.map((row) => row.publicRef).join(", ")})`}, ${reminders.length} reminders due.`);
  } finally {
    await auth.close();
  }
});
