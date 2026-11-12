import { desc } from "drizzle-orm";
import { parseEmailContent, renderEmail } from "@/lib/email/templates";
import { createDatabase } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: prints the newest message in the email outbox of the dev database, which is where a password reset
// link or an invite link goes when no Brevo key is set. It reads as the owner role because no runtime role other than the
// sender may read the link. A message that has been sent, cancelled or purged no longer has one.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const rows = await owner.db
      .select({ recipient: emailOutbox.recipient, template: emailOutbox.template, params: emailOutbox.params, subject: emailOutbox.subject, body: emailOutbox.body, link: emailOutbox.link, status: emailOutbox.status, createdAt: emailOutbox.createdAt })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);
    const newest = rows[0];
    if (newest === undefined) {
      console.log("The outbox is empty.");
      return;
    }
    // With the link still in the row, print the message as it will be sent. Without it, print the stored copy.
    const text = newest.link === null ? newest.body : renderEmail(parseEmailContent(newest.template, newest.params), newest.link).text;
    console.log(`To: ${newest.recipient}\nSubject: ${newest.subject}\nQueued: ${newest.createdAt.toISOString()} (${newest.status})\n\n${text}`);
  } finally {
    await owner.close();
  }
});
