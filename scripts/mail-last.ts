import { desc } from "drizzle-orm";
import { createDatabase } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: prints the newest message in the email outbox of the dev database, which in phase 1B is the only
// place a password reset link goes. It reads as the owner role because no runtime role may read the outbox.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const rows = await owner.db
      .select({ recipient: emailOutbox.recipient, subject: emailOutbox.subject, body: emailOutbox.body, status: emailOutbox.status, createdAt: emailOutbox.createdAt })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);
    const newest = rows[0];
    if (newest === undefined) {
      console.log("The outbox is empty.");
      return;
    }
    console.log(`To: ${newest.recipient}\nSubject: ${newest.subject}\nQueued: ${newest.createdAt.toISOString()} (${newest.status})\n\n${newest.body}`);
  } finally {
    await owner.close();
  }
});
