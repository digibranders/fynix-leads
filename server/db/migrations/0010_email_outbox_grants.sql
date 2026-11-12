-- Row-level security and grants for email_outbox. See 0002 for the rules.
--
-- leads_public may add a message and nothing else: it cannot read what is queued, so the reset flow, which runs for a
-- caller who is not signed in, cannot be used to read another person's reset link. The grant is on the whole table because
-- Drizzle names every column in an INSERT (the defaulted ones as DEFAULT), and Postgres wants the privilege on each column
-- named. The policy has no SELECT side, and no role has a SELECT grant, so nothing but the owner (and so a developer,
-- through `pnpm mail:last`) reads the table.
ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT INSERT ON "email_outbox" TO leads_public;
--> statement-breakpoint
CREATE POLICY "email_outbox_public_insert" ON "email_outbox" AS PERMISSIVE FOR INSERT TO leads_public WITH CHECK (true);
