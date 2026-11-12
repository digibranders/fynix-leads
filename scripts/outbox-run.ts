import { createDatabase } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";
import { brevoTransport } from "@/server/mail/brevo";
import { drainOutbox } from "@/server/mail/outbox";

// Sends the email waiting in the outbox once, as the leads_auth role: purge links older than a day, claim due messages, send
// them through Brevo and record the outcome. Without BREVO_API_KEY (development) it sends nothing and leaves every message
// pending, so `pnpm mail:last` can still print the newest. A cron entry or a timer runs this in production (phase 6).
runScript(async () => {
  loadEnvLocal();
  const env = getEnv();
  const auth = createDatabase(env.DATABASE_URL_AUTH, { max: 1 });
  try {
    const transport = env.BREVO_API_KEY === undefined ? null : brevoTransport({ apiKey: env.BREVO_API_KEY });
    const result = await drainOutbox(auth.db, transport);
    console.log(`Outbox run: ${result.purged} purged, ${result.claimed} claimed, ${result.sent} sent, ${result.retrying} to retry, ${result.failed} failed.`);
    if (transport === null) console.log("BREVO_API_KEY is not set, so nothing was sent. Messages stay pending; `pnpm mail:last` prints the newest.");
  } finally {
    await auth.close();
  }
});
