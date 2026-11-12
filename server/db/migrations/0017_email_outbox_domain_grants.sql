-- What phase 1C adds on email_outbox. See 0010 for the phase 1B grant (leads_public may insert and nothing else).
--
-- Fynix queues the invite email in the same transaction as the invite, reads the state of the queue (never `link`), and
-- cancels a message whose invite it revoked. leads_auth is the sender: it reads the queue, claims a message, and records the
-- outcome, including clearing the link. The link is an authentication artefact (a reset token or an invite token), and
-- leads_auth already holds the tables those tokens live in. When phase 4 sends notification emails that carry lead data
-- the sender gets a role of its own. Neither role can insert as leads_auth or delete a row.
GRANT INSERT ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "recipient", "template", "subject", "body", "params", "status", "attempts", "next_attempt_at", "last_error", "provider_id", "sent_at", "invite_id", "created_at") ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "last_error", "link") ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "email_outbox_fynix_all" ON "email_outbox" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ON "email_outbox" TO leads_auth;
--> statement-breakpoint
GRANT UPDATE ("status", "attempts", "next_attempt_at", "last_error", "provider_id", "sent_at", "link") ON "email_outbox" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "email_outbox_auth_read" ON "email_outbox" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
--> statement-breakpoint
CREATE POLICY "email_outbox_auth_update" ON "email_outbox" AS PERMISSIVE FOR UPDATE TO leads_auth USING (true) WITH CHECK (true);
