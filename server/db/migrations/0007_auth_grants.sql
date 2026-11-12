-- Row-level security and grants for Better Auth's four tables. See 0002 for the rules.
--
-- Only leads_auth holds any privilege on these tables, and the structural test (server/db/structure.integration.test.ts,
-- "only leads_auth touches the auth table") fails if any other runtime role ever does. The tenant roles and leads_public
-- get nothing, so a query bug or an injected statement on a tenant connection cannot read an email address, a password
-- hash, a session token or a reset token.
--
-- Grants are the least Better Auth needs for the flows this app uses: no DELETE on user or account (nothing is deleted),
-- and DELETE on session (sign out, expiry, revoke on password reset) and verification (a reset token is consumed).
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "user" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "account" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "user_auth_all" ON "user" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "session_auth_all" ON "session" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "account_auth_all" ON "account" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "verification_auth_all" ON "verification" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
