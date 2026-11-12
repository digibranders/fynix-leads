-- Row-level security and grants for rate_limit. See 0002 for the rules.
--
-- Only leads_public, the role for callers who are not signed in. A rate-limit call is an upsert and a delete of the
-- key's older windows, plus a purge of stale rows, so it needs all four privileges on this one table and nothing else.
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit" TO leads_public;
--> statement-breakpoint
CREATE POLICY "rate_limit_public_all" ON "rate_limit" AS PERMISSIVE FOR ALL TO leads_public USING (true) WITH CHECK (true);
